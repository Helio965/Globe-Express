import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { upstreamJson } from '@/lib/upstream';
import type { Photo } from '@/types/explorer';
import { plainText } from './wikipedia';

// CommonsMetadataExtension uses a numeric value alongside the textual license/author fields.
const metadataSchema = z.record(z.string(), z.object({ value: z.union([z.string(), z.number(), z.boolean()]).transform(String) }));
const infoSchema = z.object({ url: z.string(), thumburl: z.string().optional(), width: z.number().positive(), height: z.number().positive(), mime: z.string().optional(), descriptionurl: z.string().optional(), extmetadata: metadataSchema.optional() });
const responseSchema = z.object({ query: z.object({ pages: z.array(z.object({ title: z.string(), imageinfo: z.array(infoSchema).optional(), categories: z.array(z.object({ title: z.string() })).optional() })) }).optional() });
const thumbnailsSchema = z.object({ query: z.object({ pages: z.array(z.object({ title: z.string(), imageinfo: z.array(z.object({ url: z.string().optional(), thumburl: z.string().optional() })).optional() })) }).optional() });
const categorySchema = z.object({ query: z.object({ categorymembers: z.array(z.object({ title: z.string(), ns: z.number() })) }) });

function trustedMediaUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname) || url.username || url.password) return undefined;
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    return url.toString();
  } catch { return undefined; }
}
function safeLicenseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try { const url = new URL(raw.replace(/&amp;/g, '&')); return url.protocol === 'https:' && ['creativecommons.org', 'www.creativecommons.org', 'commons.wikimedia.org'].includes(url.hostname) && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; }
}
function licensed(name: string, copyrighted: string | undefined): boolean {
  const compact = name.toLowerCase().replace(/[-_ ]/g, '');
  return /^(ccby(sa)?\d(?:\.\d)?|cc0(?:1\.0)?|cczero|publicdomain|domíniopúblico|pd(?:old|user|self|usgov|art|textlogo)?)/.test(compact) || copyrighted === 'False';
}

/** Discover files only in the exact Commons category linked by the place's Wikidata entity. */
export async function getCommonsCategoryFiles(category: string, signal?: AbortSignal): Promise<string[]> {
  if (!category || category.length > 300 || category.includes('|')) return [];
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', list: 'categorymembers', cmtitle: `Category:${category}`, cmnamespace: '6', cmtype: 'file', cmlimit: '40' }).toString();
  const parsed = categorySchema.safeParse(await upstreamJson(url, { signal }));
  if (!parsed.success) throw new ApiError('UPSTREAM_INVALID', 'O Wikimedia Commons retornou uma categoria incompleta.', 502);
  return parsed.data.query.categorymembers.filter((file) => file.ns === 6).map((file) => file.title);
}

/** Candidates come from an entity's P18, lead image or its linked Commons category. */
export async function getCommonsPhotos(fileNames: string[], placeName: string, signal?: AbortSignal, primaryFileNames: string[] = fileNames.slice(0, 2)): Promise<Photo[]> {
  const normalizedFile = (name: string) => name.replace(/^(?:File|Ficheiro|Arquivo):/i, '').replace(/_/g, ' ').trim();
  const primaryFiles = new Set(primaryFileNames.map((name) => normalizedFile(name).toLowerCase()));
  const candidates = [...new Set(fileNames.map(normalizedFile).filter((name) => /\.(?:jpe?g|png|webp)$/i.test(name) && !/(?:\b(?:flag|logo|coat of arms|locator|map|diagram|icon|seal|signature|graph|chart)\b|bandeira|brasão|mapa)/i.test(name)))].slice(0, 40);
  if (!candidates.length) return [];
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', titles: candidates.map((name) => `File:${name}`).join('|'), prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1920', cllimit: '30' }).toString();
  const thumbnailsUrl = new URL(url);
  thumbnailsUrl.searchParams.set('prop', 'imageinfo');
  thumbnailsUrl.searchParams.set('iiprop', 'url');
  thumbnailsUrl.searchParams.set('iiurlwidth', '480');
  thumbnailsUrl.searchParams.delete('cllimit');
  // Wikimedia now rounds thumbnail URLs to supported sizes. Use the URL supplied by its API.
  const [metadataResponse, thumbnailResponse] = await Promise.allSettled([upstreamJson(url, { signal }), upstreamJson(thumbnailsUrl, { signal })]);
  if (metadataResponse.status === 'rejected') throw metadataResponse.reason;
  const parsed = responseSchema.safeParse(metadataResponse.value);
  if (!parsed.success || !parsed.data.query) throw new ApiError('UPSTREAM_INVALID', 'O Wikimedia Commons retornou uma resposta incompleta.', 502);
  const smaller = thumbnailResponse.status === 'fulfilled' ? thumbnailsSchema.safeParse(thumbnailResponse.value) : undefined;
  const thumbnails = new Map<string, string>();
  if (smaller?.success) for (const page of smaller.data.query?.pages ?? []) {
    const image = page.imageinfo?.[0];
    const thumbnail = trustedMediaUrl(image?.thumburl) ?? trustedMediaUrl(image?.url);
    if (thumbnail) thumbnails.set(page.title, thumbnail);
  }
  const seen = new Set<string>();
  const photos: Photo[] = [];
  for (const page of parsed.data.query.pages) {
    const info = page.imageinfo?.[0];
    if (!info || info.width < 800 || info.height < 400 || !/^image\/(?:jpeg|png|webp)$/.test(info.mime ?? '') || info.width / info.height > 3.8) continue;
    if (page.categories?.some((category) => /(?:AI.generated|AI generated|artificial intelligence|synthetic images|maps of|logos of|flags of)/i.test(category.title))) continue;
    const metadata = info.extmetadata ?? {};
    const license = plainText(metadata.LicenseShortName?.value || metadata.UsageTerms?.value, 160);
    const author = plainText(metadata.Artist?.value || metadata.Credit?.value, 350);
    if (!license || !author || !licensed(license, metadata.Copyrighted?.value)) continue;
    if (/(?:AI.generated|AI generated|generated by (?:midjourney|dall|stable diffusion))/i.test(plainText(metadata.ImageDescription?.value))) continue;
    const originalUrl = trustedMediaUrl(info.url);
    const displayUrl = trustedMediaUrl(info.thumburl) ?? originalUrl;
    if (!originalUrl || !displayUrl || seen.has(originalUrl)) continue;
    seen.add(originalUrl);
    photos.push({ id: page.title, url: displayUrl, thumbnailUrl: thumbnails.get(page.title) ?? displayUrl, width: info.width, height: info.height, alt: plainText(metadata.ImageDescription?.value, 350) || `Fotografia de ${placeName}`, author, license, licenseUrl: safeLicenseUrl(metadata.LicenseUrl?.value), sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, provider: 'commons' });
  }
  return photos.sort((a, b) => {
    const score = (photo: Photo) => (photo.width >= photo.height * 1.2 && photo.width <= photo.height * 2.8 ? 2e8 : 0) + (primaryFiles.has(normalizedFile(photo.id).toLowerCase()) ? 1e8 : 0) + Math.min(photo.width * photo.height, 2e7);
    return score(b) - score(a);
  }).slice(0, 10);
}
