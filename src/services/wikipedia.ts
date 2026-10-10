import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { upstreamJson } from '@/lib/upstream';
import type { Coordinates, Language, Location, SearchSuggestion } from '@/types/explorer';

const coordinateSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), globe: z.string().optional(), primary: z.union([z.string(), z.boolean()]).optional() });
const pageSchema = z.object({
  pageid: z.number().optional(), title: z.string(), missing: z.boolean().optional(), index: z.number().optional(),
  coordinates: z.array(coordinateSchema).optional(), description: z.string().optional(), extract: z.string().optional(),
  pageprops: z.object({ wikibase_item: z.string().optional(), disambiguation: z.string().optional(), }).passthrough().optional(),
  pageimage: z.string().optional(), images: z.array(z.object({ title: z.string() })).optional(),
  coordinateSource: z.string().optional(),
});
const querySchema = z.object({ error: z.object({ code: z.string(), info: z.string().optional() }).optional(), query: z.object({ pages: z.array(pageSchema).optional(), geosearch: z.array(z.object({ pageid: z.number(), title: z.string(), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), dist: z.number().nonnegative() })).optional() }).optional() });
export type WikiPage = z.infer<typeof pageSchema>;
export interface WikiArticle { page: WikiPage; language: Language; url: string }
export interface GeoArticle { pageid: number; title: string; coordinates: Coordinates; distanceKm: number; language: Language }
const articleCache = new Map<string, { article: WikiArticle; expires: number }>();
const wikidataSnakSchema = z.object({ rank: z.string().optional(), mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) });
const geographicEntitiesSchema = z.object({ entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.array(wikidataSnakSchema)).optional() }).passthrough()) });
const globeCoordinateSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), globe: z.string() });

/** Some language editions use a Wikidata infobox without registering a GeoData coordinate. */
async function fillWikidataCoordinates(pages: WikiPage[], signal?: AbortSignal): Promise<void> {
  const missing = pages.filter((page) => !page.missing && !pageCoordinates(page) && page.pageprops?.disambiguation === undefined && /^Q\d+$/.test(page.pageprops?.wikibase_item ?? ''));
  const ids = [...new Set(missing.map((page) => page.pageprops!.wikibase_item!))];
  if (!ids.length) return;
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims', format: 'json', origin: '*' }).toString();
  const result = geographicEntitiesSchema.safeParse(await upstreamJson(url, { signal }));
  if (!result.success) throw new ApiError('UPSTREAM_INVALID', 'O Wikidata não retornou coordenadas verificáveis.', 502);
  for (const page of missing) {
    const id = page.pageprops!.wikibase_item!;
    const claims = result.data.entities[id]?.claims ?? {};
    // An entity describing a person or a disambiguation page is not a geographic result.
    const nonGeographic = (claims.P31 ?? []).some((claim) => {
      const value = z.object({ id: z.string() }).safeParse(claim.mainsnak.datavalue?.value);
      return value.success && ['Q5', 'Q4167410'].includes(value.data.id);
    });
    if (nonGeographic) continue;
    const usable = (claims.P625 ?? []).filter((claim) => claim.rank !== 'deprecated').sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'));
    for (const claim of usable) {
      const value = globeCoordinateSchema.safeParse(claim.mainsnak.datavalue?.value);
      if (!value.success || !/^https?:\/\/www\.wikidata\.org\/entity\/Q2$/.test(value.data.globe)) continue;
      page.coordinates = [{ lat: value.data.latitude, lon: value.data.longitude, primary: true, globe: 'earth' }];
      page.coordinateSource = `https://www.wikidata.org/wiki/${id}`;
      break;
    }
  }
}

/** Wikimedia metadata contains markup; every user-facing string stays plain text. */
export function plainText(value: string | undefined, maxLength = 18000): string {
  if (!value) return '';
  const withoutTags = (text: string) => text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, ' ');
  const decoded = withoutTags(value).replace(/&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_match, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
    if (decimal || hexadecimal) {
      const point = Number.parseInt(decimal ?? hexadecimal!, decimal ? 10 : 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[named?.toLowerCase() ?? ''] ?? '';
  });
  return withoutTags(decoded).replace(/\r/g, '').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLength);
}

export function wikiUrl(title: string, language: Language): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export async function wikiQuery(language: Language, parameters: Record<string, string>, signal?: AbortSignal) {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', utf8: '1', ...parameters }).toString();
  const result = querySchema.safeParse(await upstreamJson(url, { signal }));
  if (!result.success) throw new ApiError('UPSTREAM_INVALID', 'A Wikipedia retornou uma resposta incompleta.', 502);
  if (result.data.error) throw new ApiError('WIKIPEDIA_UNAVAILABLE', 'A Wikipedia não conseguiu responder à consulta.', 502);
  return result.data.query;
}

export function pageCoordinates(page: WikiPage): Coordinates | undefined {
  if (page.missing || page.pageprops?.disambiguation !== undefined) return undefined;
  const coordinate = page.coordinates?.find((value) => !value.globe || value.globe === 'earth');
  return coordinate ? { lat: coordinate.lat, lng: coordinate.lon } : undefined;
}

export function articleLocation(article: WikiArticle): Location {
  const coordinates = pageCoordinates(article.page);
  if (!coordinates || !article.page.pageid) throw new ApiError('LOCATION_NOT_FOUND', 'Este artigo não possui uma localização geográfica verificável.', 404);
  return {
    reference: { provider: 'wikipedia', id: String(article.page.pageid), language: article.language },
    name: plainText(article.page.title, 300), coordinates, kind: plainText(article.page.description, 300) || 'Local geográfico documentado',
    sourceUrl: article.url, attributions: ['Wikipedia · texto sob licença CC BY-SA', ...(article.page.coordinateSource ? ['Wikidata · coordenadas sob licença CC0'] : [])],
  };
}

export async function searchWikipedia(query: string, language: Language, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  // The coordinates limit is shared by every generated page, so one would silently discard other matches.
  const result = await wikiQuery(language, { generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: '20', prop: 'coordinates|pageprops|description', colimit: 'max', coprimary: 'primary', coprop: 'globe' }, signal);
  const pages = result?.pages ?? [];
  try { await fillWikidataCoordinates(pages, signal); } catch { abortIfRequested(signal); /* Existing GeoData results remain usable when the optional source is unavailable. */ }
  return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((page) => {
    const coords = pageCoordinates(page);
    if (!coords || !page.pageid) return [];
    return [{ reference: { provider: 'wikipedia' as const, id: String(page.pageid), language }, title: plainText(page.title, 300), subtitle: plainText(page.description, 250) || `${coords.lat.toFixed(3)}°, ${coords.lng.toFixed(3)}° · Wikipedia ${language.toUpperCase()}` }];
  });
}

export async function getWikipediaArticle(id: string, language: Language, signal?: AbortSignal): Promise<WikiArticle> {
  abortIfRequested(signal);
  const cacheKey = `${language}:${id}`;
  const cached = articleCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.article;
  if (cached) articleCache.delete(cacheKey);
  const result = await wikiQuery(language, {
    ...(/^\d+$/.test(id) ? { pageids: id } : { titles: id }), redirects: '1',
    prop: 'coordinates|pageprops|description|extracts|pageimages|images',
    colimit: '1', coprimary: 'primary', coprop: 'globe', exsectionformat: 'wiki', explaintext: '1', exlimit: '1', imlimit: '40', piprop: 'name',
  }, signal);
  const pages = result?.pages ?? [];
  await fillWikidataCoordinates(pages, signal);
  const page = pages.find((entry) => !entry.missing && entry.pageid && pageCoordinates(entry));
  if (!page) throw new ApiError('LOCATION_NOT_FOUND', 'Não foi encontrado um artigo geográfico para este local.', 404);
  const article: WikiArticle = { page, language, url: wikiUrl(page.title, language) };
  // Store only successful Wikimedia data, never a request promise or the caller's cancellation signal.
  if (articleCache.size >= 64) articleCache.delete(articleCache.keys().next().value!);
  articleCache.set(cacheKey, { article, expires: Date.now() + 60000 });
  return article;
}

export async function geoWikipedia(coordinates: Coordinates, language: Language, radiusMeters = 10000, limit = 10, signal?: AbortSignal): Promise<GeoArticle[]> {
  const result = await wikiQuery(language, { list: 'geosearch', gscoord: `${coordinates.lat}|${coordinates.lng}`, gsradius: String(Math.max(10, Math.min(10000, radiusMeters))), gslimit: String(Math.max(1, Math.min(50, limit))), gsnamespace: '0', gsprop: 'type|name|dim|country|region' }, signal);
  return (result?.geosearch ?? []).map((page) => ({ pageid: page.pageid, title: plainText(page.title, 300), coordinates: { lat: page.lat, lng: page.lon }, distanceKm: page.dist / 1000, language })).filter((entry) => entry.distanceKm <= radiusMeters / 1000).sort((a, b) => a.distanceKm - b.distanceKm);
}

export function geoLocation(article: GeoArticle): Location {
  return { reference: { provider: 'wikipedia', id: String(article.pageid), language: article.language }, name: article.title, coordinates: article.coordinates, kind: 'Local próximo documentado', sourceUrl: wikiUrl(article.title, article.language), attributions: ['Wikipedia · CC BY-SA'] };
}

export function abortIfRequested(signal?: AbortSignal): void { signal?.throwIfAborted(); }
