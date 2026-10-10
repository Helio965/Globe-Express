import { z } from "zod";
import type { Coordinates, Fact, NearbyPlace, Photo, Place, PlaceRef, SearchSuggestion, Source } from "@/types/explorer";

type Language = "pt" | "en";
type WikipediaRef = Extract<PlaceRef, { provider: "wikipedia" }>;
export type WikipediaEnrichment = {
  summary: string; description: string; photos: Photo[]; facts: Fact[]; sources: Source[]; warnings: string[];
};

const TIMEOUT_MS = 9_000;
const coordinatesSchema = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), globe: z.string().optional() });
const pageSchema = z.object({
  pageid: z.number().int().positive(), title: z.string().min(1).max(500),
  coordinates: z.array(coordinatesSchema).optional(),
  description: z.string().optional(), extract: z.string().optional(),
  pageimage: z.string().optional(), images: z.array(z.object({ title: z.string() })).optional(),
  pageprops: z.object({ wikibase_item: z.string().regex(/^Q\d+$/).optional(), disambiguation: z.unknown().optional() }).optional(),
  index: z.number().optional(), missing: z.boolean().optional(),
});
type Article = z.infer<typeof pageSchema>;
const envelopeSchema = z.object({
  batchcomplete: z.boolean().optional(),
  error: z.object({ code: z.string(), info: z.string().optional() }).optional(),
  query: z.object({
    pages: z.array(z.unknown()).optional(),
    normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
    redirects: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
  }).optional(),
});
const claimSchema = z.object({
  rank: z.enum(["normal", "preferred", "deprecated"]).optional(),
  mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }),
  qualifiers: z.record(z.string(), z.array(z.object({ datavalue: z.object({ value: z.unknown() }).optional() }))).optional(),
});
type Claim = z.infer<typeof claimSchema>;
const entitySchema = z.object({
  labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
  descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(),
  claims: z.record(z.string(), z.array(claimSchema)).optional(),
});
type Entity = z.infer<typeof entitySchema>;

export class WikimediaError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); this.name = "WikimediaError"; }
}

function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Operação cancelada", "AbortError");
}

/** Requests only fixed Wikimedia endpoints. Never use a URL returned by an upstream API for fetching. */
async function request(endpoint: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  cancelled(signal);
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ ...params, format: "json", formatversion: "2", maxlag: "5" }).toString();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GlobeExpress/1.0 (https://github.com/Helio965/Globe-Express; geographical discovery)" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      cache: "no-store",
    });
    if (!response.ok) throw new WikimediaError(`Wikimedia indisponível (HTTP ${response.status}).`, response.status === 429 ? 429 : 502);
    const json: unknown = await response.json();
    const apiError = z.object({ error: z.object({ code: z.string() }) }).safeParse(json);
    if (apiError.success) throw new WikimediaError(`Wikimedia não concluiu a consulta (${apiError.data.error.code}).`);
    return json;
  } catch (error) {
    cancelled(signal);
    if (error instanceof WikimediaError) throw error;
    throw new WikimediaError(timeout.aborted ? "A consulta à Wikimedia excedeu o tempo limite." : "Não foi possível consultar a Wikimedia.");
  }
}

async function articles(language: Language, params: Record<string, string>, signal?: AbortSignal): Promise<Article[]> {
  const data = envelopeSchema.safeParse(await request(`https://${language}.wikipedia.org/w/api.php`, {
    action: "query", prop: "coordinates|pageprops|description", coprimary: "primary", colimit: "max", ...params,
  }, signal));
  if (!data.success || (!data.data.query && data.data.batchcomplete !== true)) throw new WikimediaError("A Wikipédia retornou dados inválidos.");
  // MediaWiki omits `query` entirely when a generator has no matching pages.
  if (!data.data.query) return [];
  const pages = (data.data.query.pages ?? []).flatMap(value => {
    const parsed = pageSchema.safeParse(value);
    return parsed.success && !parsed.data.missing ? [parsed.data] : [];
  });
  // Some geographic articles use a Wikidata-backed map and expose no MediaWiki coordinates.
  const withoutCoordinates = pages.filter(page => !page.coordinates?.length && page.pageprops?.wikibase_item && !Object.prototype.hasOwnProperty.call(page.pageprops, "disambiguation"));
  if (withoutCoordinates.length) {
    try {
      const values = await entities([...new Set(withoutCoordinates.map(page => page.pageprops!.wikibase_item!))], signal);
      for (const page of withoutCoordinates) {
        const entity = values[page.pageprops!.wikibase_item!];
        if (!entity) continue;
        const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), globe: z.string() }).safeParse(claims(entity, "P625")[0]?.mainsnak.datavalue?.value);
        if (coordinate.success && /^https?:\/\/www\.wikidata\.org\/entity\/Q2$/.test(coordinate.data.globe)) page.coordinates = [{ lat: coordinate.data.latitude, lon: coordinate.data.longitude, globe: "earth" }];
      }
    } catch { cancelled(signal); /* Keep other verified geographic results when structured data is unavailable. */ }
  }
  return pages;
}

function isGeographic(article: Article): boolean {
  const coordinate = article.coordinates?.[0];
  return !!coordinate && (!coordinate.globe || coordinate.globe === "earth")
    && !Object.prototype.hasOwnProperty.call(article.pageprops ?? {}, "disambiguation");
}

function articleUrl(title: string, language: Language): string {
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

/** Upstream HTML is converted to text; no component receives executable markup. */
function plain(value: string, max = 20_000): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code: string) => {
      const n = code.startsWith("x") || code.startsWith("X") ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "‹").replace(/&gt;/gi, "›").replace(/&amp;/gi, "&")
    .replaceAll("<", "‹").replaceAll(">", "›")
    .replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function summaryText(value: string): string {
  const paragraph = value.split(/\n+/).find(line => line.trim()) ?? "";
  if (paragraph.length <= 700) return paragraph;
  const cut = paragraph.slice(0, 701);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : 700)}…`;
}

function normalize(value: string): string {
  return plain(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function toPlace(article: Article, language: Language): Place {
  const coordinate = article.coordinates?.[0];
  if (!coordinate || !isGeographic(article)) throw new WikimediaError("Este artigo não possui uma localização geográfica verificada.", 404);
  return {
    id: `wikipedia:${language}:${article.pageid}`, ref: { provider: "wikipedia", id: String(article.pageid), language },
    name: plain(article.title, 250), address: plain(article.description ?? "", 400),
    kind: article.description ? plain(article.description, 200) : undefined,
    coordinates: { lat: coordinate.lat, lng: coordinate.lon }, source: "Wikipedia",
  };
}

async function keywordArticles(query: string, language: Language, signal?: AbortSignal) {
  return (await articles(language, { generator: "search", gsrsearch: query.slice(0, 160), gsrnamespace: "0", gsrlimit: "15" }, signal))
    .filter(isGeographic).sort((a, b) => (a.index ?? 100) - (b.index ?? 100));
}

function searchTitle(article: Article): string {
  return normalize(article.title.replace(/\s*\([^)]*\)\s*$/, ""));
}

function rankedSuggestions(query: string, groups: { language: Language; pages: Article[] }[]): SearchSuggestion[] {
  const expected = normalize(query);
  const tokens = [...new Set(expected.split(" ").filter(token => token.length > 2))];
  const candidates = new Map<string, { page: Article; language: Language; score: number }>();
  for (const { language, pages } of groups) {
    for (const page of pages) {
      const title = searchTitle(page);
      const titleTokens = new Set(title.split(" "));
      const coverage = tokens.length ? tokens.filter(token => titleTokens.has(token)).length / tokens.length : 0;
      const score = (title === expected ? 1_000 : title.startsWith(`${expected} `) ? 800 : title.includes(expected) ? 600 : coverage * 300) - (page.index ?? 15);
      const coordinate = page.coordinates![0];
      const key = page.pageprops?.wikibase_item ?? `${title}:${coordinate.lat.toFixed(4)}:${coordinate.lon.toFixed(4)}`;
      const existing = candidates.get(key);
      if (!existing) candidates.set(key, { page, language, score });
      else {
        existing.score = Math.max(existing.score, score);
        // Both articles describe the same Wikidata entity. Prefer its Portuguese article.
        if (language === "pt") { existing.page = page; existing.language = language; }
      }
    }
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || (a.language === "pt" ? -1 : 1)).slice(0, 8)
    .map(({ page, language }) => ({
      ref: { provider: "wikipedia", id: String(page.pageid), language }, label: plain(page.title, 250),
      description: plain(page.description ?? `Wikipédia · ${language.toUpperCase()}`, 400),
    }));
}

export async function searchWikipedia(query: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  let lastError: unknown;
  const groups: { language: Language; pages: Article[] }[] = [];
  for (const language of ["pt", "en"] as const) {
    try {
      const pages = await keywordArticles(text, language, signal);
      groups.push({ language, pages });
      // A tangential Portuguese result must not hide the exact English destination.
      if (language === "pt" && pages.some(page => searchTitle(page) === normalize(text))) return rankedSuggestions(text, groups);
    } catch (error) { cancelled(signal); lastError = error; }
  }
  const suggestions = rankedSuggestions(text, groups);
  if (suggestions.length) return suggestions;
  if (lastError) throw lastError;
  return [];
}

async function loadArticle(ref: WikipediaRef, detailed: boolean, signal?: AbortSignal): Promise<Article> {
  if (!/^\d+$/.test(ref.id) || !["pt", "en"].includes(ref.language)) throw new WikimediaError("Referência da Wikipédia inválida.", 400);
  const pages = await articles(ref.language, {
    pageids: ref.id,
    ...(detailed ? { prop: "coordinates|pageprops|description|extracts|pageimages|images", explaintext: "1", exintro: "1", exsectionformat: "plain", imlimit: "30", piprop: "name" } : {}),
  }, signal);
  const article = pages.find(page => String(page.pageid) === ref.id && isGeographic(page));
  if (!article) throw new WikimediaError("Local não encontrado na Wikipédia.", 404);
  return article;
}

export async function resolveWikipedia(ref: WikipediaRef, signal?: AbortSignal): Promise<Place> {
  return toPlace(await loadArticle(ref, false, signal), ref.language);
}

export function geographicDistance(a: Coordinates, b: Coordinates): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export async function reverseWikipedia(coordinates: Coordinates, signal?: AbortSignal): Promise<Place> {
  cancelled(signal);
  const valid = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(coordinates);
  // A nearby article is not a reverse geocoder. Retain remote/ocean clicks exactly.
  return {
    id: `coordinates:${valid.lat}:${valid.lng}`, ref: { provider: "coordinates", ...valid }, coordinates: valid,
    name: "Ponto selecionado", address: `${valid.lat.toFixed(5)}°, ${valid.lng.toFixed(5)}°`, source: "Coordinates", kind: "Coordenadas geográficas",
  };
}

export async function nearbyWikipedia(place: Place, signal?: AbortSignal): Promise<NearbyPlace[]> {
  let lastError: unknown;
  for (const language of ["pt", "en"] as const) {
    try {
      const pages = await articles(language, {
        generator: "geosearch", ggscoord: `${place.coordinates.lat}|${place.coordinates.lng}`, ggsradius: "10000", ggslimit: "12", ggsnamespace: "0",
        prop: "coordinates|pageprops|description|pageimages", piprop: "name",
      }, signal);
      const nearby = pages.filter(isGeographic).map(article => {
        const candidate = toPlace(article, language);
        const distanceMeters = Math.round(geographicDistance(place.coordinates, candidate.coordinates));
        const nearbyPlace: NearbyPlace = { place: candidate, distanceMeters };
        return { article, nearbyPlace, distanceMeters };
      })
        .filter(({ nearbyPlace, distanceMeters }) => nearbyPlace.place.id !== place.id && normalize(nearbyPlace.place.name) !== normalize(place.name) && distanceMeters > 20)
        .sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 8);
      if (nearby.length) {
        // Only each article's lead image is eligible, with independently verified Commons credits.
        // One shared deadline bounds the optional photo stage instead of delaying every card in turn.
        const timeout = AbortSignal.timeout(5_000);
        const photoSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
        await Promise.all(nearby.slice(0, 4).map(async ({ article, nearbyPlace }) => {
          try {
            const [photo] = await licensedPhotos({ ...article, images: undefined }, undefined, photoSignal);
            if (photo) nearbyPlace.photo = photo;
          } catch { cancelled(signal); /* Missing or slow photos must not erase nearby places. */ }
        }));
        cancelled(signal);
        return nearby.map(({ nearbyPlace }) => nearbyPlace);
      }
    } catch (error) { cancelled(signal); lastError = error; }
  }
  if (lastError) throw lastError;
  return [];
}

async function matchingArticle(place: Place, signal?: AbortSignal): Promise<{ article: Article; language: Language } | null> {
  if (place.ref.provider === "wikipedia") return { article: await loadArticle(place.ref, true, signal), language: place.ref.language };
  // A real geocoder may identify a named locality at the clicked coordinates.
  // Anonymous points must never borrow the identity of the nearest article.
  if (place.ref.provider === "coordinates" && place.source !== "Google Maps") return null;
  let lastError: unknown;
  for (const language of ["pt", "en"] as const) {
    try {
      const candidates = await keywordArticles(place.name, language, signal);
      const expected = normalize(place.name);
      const isMatch = (candidate: Article) => {
        const coordinate = candidate.coordinates![0];
        const title = normalize(candidate.title.replace(/\s*\([^)]*\)\s*$/, ""));
        return title === expected && geographicDistance(place.coordinates, { lat: coordinate.lat, lng: coordinate.lon }) <= 1_500;
      };
      const match = candidates.find(isMatch);
      if (match) {
        const detailed = await loadArticle({ provider: "wikipedia", id: String(match.pageid), language }, true, signal);
        if (isMatch(detailed)) return { article: detailed, language };
      }
    } catch (error) { cancelled(signal); lastError = error; }
  }
  if (lastError) throw lastError;
  return null;
}

async function entities(ids: string[], signal?: AbortSignal): Promise<Record<string, Entity>> {
  const parsed = z.object({ entities: z.record(z.string(), z.unknown()) }).safeParse(await request("https://www.wikidata.org/w/api.php", {
    action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims", languages: "pt|en", languagefallback: "1",
  }, signal));
  if (!parsed.success) throw new WikimediaError("O Wikidata retornou dados inválidos.");
  return Object.fromEntries(Object.entries(parsed.data.entities).flatMap(([id, value]) => {
    const entity = entitySchema.safeParse(value);
    return entity.success ? [[id, entity.data]] : [];
  }));
}

function claims(entity: Entity, property: string): Claim[] {
  const all = (entity.claims?.[property] ?? []).filter(claim => claim.rank !== "deprecated");
  const preferred = all.filter(claim => claim.rank === "preferred");
  return preferred.length ? preferred : all;
}

function referencedEntity(claim?: Claim): string | undefined {
  const parsed = z.object({ id: z.string().regex(/^Q\d+$/) }).safeParse(claim?.mainsnak.datavalue?.value);
  return parsed.success ? parsed.data.id : undefined;
}

function claimDate(claim: Claim): string {
  const parsed = z.object({ time: z.string() }).safeParse(claim.qualifiers?.P585?.[0]?.datavalue?.value);
  return parsed.success ? parsed.data.time : "";
}

async function geographicFacts(entity: Entity, qid: string, signal?: AbortSignal): Promise<{ facts: Fact[]; labelsUnavailable: boolean }> {
  const sourceUrl = `https://www.wikidata.org/wiki/${qid}`;
  const facts: Fact[] = [];
  for (const [property, label, unit] of [["P2044", "Altitude", "m"], ["P2046", "Área", "km²"], ["P1082", "População", ""]] as const) {
    const claim = [...claims(entity, property)].sort((a, b) => claimDate(b).localeCompare(claimDate(a)))[0];
    const quantity = z.object({ amount: z.string().regex(/^[+-]?\d+(?:\.\d+)?$/), unit: z.string() }).safeParse(claim?.mainsnak.datavalue?.value);
    if (!quantity.success) continue;
    let amount = Number(quantity.data.amount);
    if (!Number.isFinite(amount)) continue;
    const wikidataUnit = quantity.data.unit.split("/").at(-1);
    if (property === "P2044" && wikidataUnit !== "Q11573") continue;
    if (property === "P2046") {
      if (wikidataUnit === "Q25343") amount /= 1_000_000;
      else if (wikidataUnit !== "Q712226") continue; // square kilometre
    }
    if (property === "P1082" && quantity.data.unit !== "1") continue;
    const date = claim ? claimDate(claim).match(/^\+(\d{4})-/)?.[1] : undefined;
    facts.push({ label: `${label}${date ? ` (${date})` : ""}`, value: `${amount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`, sourceUrl });
  }
  const references = [["P17", "País"], ["P131", "Região"], ["P31", "Categoria"]] as const;
  const selected = references.map(([property, label]) => ({ id: referencedEntity(claims(entity, property)[0]), label })).filter(item => !!item.id);
  if (selected.length) {
    let values: Record<string, Entity>;
    try { values = await entities([...new Set(selected.map(item => item.id!))], signal); }
    catch { cancelled(signal); return { facts, labelsUnavailable: true }; }
    for (const { id, label } of selected) {
      const item = values[id!];
      const value = item?.labels?.pt?.value ?? item?.labels?.en?.value;
      if (value) facts.push({ label, value: plain(value, 250), sourceUrl });
    }
  }
  return { facts, labelsUnavailable: false };
}

function safeMediaUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)
      && !url.port && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function safeCommonsUrl(raw: string): string | undefined {
  try { const url = new URL(raw); return url.protocol === "https:" && url.hostname === "commons.wikimedia.org" && !url.port && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

const photoPageSchema = z.object({
  pageid: z.number().optional(), title: z.string(),
  imageinfo: z.array(z.object({
    url: z.string(), thumburl: z.string().optional(), descriptionurl: z.string(), width: z.number().positive(), height: z.number().positive(),
    mime: z.string(), mediatype: z.string().optional(),
    extmetadata: z.record(z.string(), z.object({ value: z.string() })).optional(),
  })).optional(),
});

type PhotoCandidate = { title: string; direct: boolean };
function fileTitle(value: string): string { return `File:${value.replace(/^(File|Image|Arquivo|Ficheiro):/i, "").trim()}`; }
function photographic(title: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(title)
    && !/(?:\bflag\b|\bcoat of arms\b|\bbras[aã]o\b|\bbandeira\b|\blogo\b|\bicon\b|locator|\bmap\b|\bmapa\b|\bchart\b|\bdiagram\b)/i.test(title.replaceAll("_", " "));
}
function namesSubject(value: string, title: string): boolean {
  const name = normalize(title.replace(/\s*\([^)]*\)\s*$/, ""));
  return name.length >= 4 && ` ${normalize(value)} `.includes(` ${name} `);
}

function freeLicense(value: string): boolean {
  return /^(?:CC0(?: 1\.0)?|CC BY(?:-SA)?(?: (?:1\.0|2\.0|2\.5|3\.0|4\.0))?(?: [A-Z]{2})?|Public domain|Dom[ií]nio p[uú]blico|PD|GFDL(?: 1\.[123])?)$/i.test(value);
}

function isIllustration(value: string): boolean {
  return /\b(?:paintings?|pinturas?|engraving|gravura|lithograph|oil on canvas|illustrations?|ilustracao|drawings?|maps?|mapas?|cartography|coats? of arms|flags?|brasao|bandeiras?|crest|logos?)\b/.test(normalize(value));
}

async function licensedPhotos(article: Article, entity: Entity | undefined, signal?: AbortSignal): Promise<Photo[]> {
  const candidates = new Map<string, PhotoCandidate>();
  for (const claim of entity ? claims(entity, "P18") : []) {
    const parsed = z.string().safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success && photographic(parsed.data)) candidates.set(fileTitle(parsed.data), { title: fileTitle(parsed.data), direct: true });
  }
  if (article.pageimage && photographic(article.pageimage)) candidates.set(fileTitle(article.pageimage), { title: fileTitle(article.pageimage), direct: true });
  for (const image of article.images ?? []) {
    const title = fileTitle(image.title);
    if (!candidates.has(title) && photographic(title) && namesSubject(title, article.title)) candidates.set(title, { title, direct: false });
  }
  const selected = [...candidates.values()].slice(0, 10);
  if (!selected.length) return [];
  const response = envelopeSchema.safeParse(await request("https://commons.wikimedia.org/w/api.php", {
    action: "query", titles: selected.map(candidate => candidate.title).join("|"), prop: "imageinfo", redirects: "1",
    iiprop: "url|size|mime|mediatype|extmetadata", iiurlwidth: "1600", iiextmetadatalanguage: "pt", iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|ImageDescription|ObjectName|AttributionRequired|Copyrighted|Categories",
  }, signal));
  if (!response.success || !response.data.query) throw new WikimediaError("O Wikimedia Commons retornou metadados inválidos.");
  const photos: Photo[] = [];
  const allowedDirect = new Set(selected.filter(candidate => candidate.direct).map(candidate => normalize(candidate.title)));
  for (const renamed of [...response.data.query.normalized ?? [], ...response.data.query.redirects ?? []]) {
    if (allowedDirect.has(normalize(renamed.from))) allowedDirect.add(normalize(renamed.to));
  }
  for (const raw of response.data.query.pages ?? []) {
    const parsed = photoPageSchema.safeParse(raw);
    if (!parsed.success) continue;
    const page = parsed.data;
    const info = page.imageinfo?.[0];
    if (!info || !/^image\/(jpeg|png|webp)$/.test(info.mime) || info.width < 300 || info.height < 200) continue;
    const meta = info.extmetadata ?? {};
    const url = safeMediaUrl(info.url), thumbnailUrl = safeMediaUrl(info.thumburl ?? info.url), sourceUrl = safeCommonsUrl(info.descriptionurl);
    const license = plain(meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? "", 150);
    const author = plain(meta.Artist?.value ?? "", 4_000);
    const description = plain(meta.ImageDescription?.value ?? meta.ObjectName?.value ?? "", 1000);
    if (!url || !thumbnailUrl || !sourceUrl || !license || !author) continue;
    if (!freeLicense(license)) continue;
    const categories = meta.Categories?.value ?? "";
    if (isIllustration(`${page.title} ${description} ${categories}`)) continue;
    if (!allowedDirect.has(normalize(page.title))) {
      const hasPhotographyEvidence = /\b(?:photographs?|photography|fotografias?|taken with|taken on|photographed)\b/.test(normalize(categories));
      if (!hasPhotographyEvidence || !namesSubject(page.title, article.title) || !namesSubject(description, article.title)) continue;
    }
    photos.push({
      id: `commons:${page.pageid ?? page.title}`, url, thumbnailUrl, width: info.width, height: info.height,
      alt: description || `${plain(article.title)} — ${plain(page.title.replace(/^File:/, "").replace(/\.[^.]+$/, ""))}`,
      source: "Wikimedia Commons", author, license, sourceUrl,
    });
  }
  return photos.slice(0, 8);
}

export async function enrichWikipedia(place: Place, signal?: AbortSignal): Promise<WikipediaEnrichment> {
  cancelled(signal);
  const result: WikipediaEnrichment = { summary: "", description: "", photos: [], facts: [], sources: [], warnings: [] };
  let matched: Awaited<ReturnType<typeof matchingArticle>>;
  try { matched = await matchingArticle(place, signal); }
  catch { cancelled(signal); result.warnings.push("Não foi possível carregar as informações da Wikipédia."); return result; }
  if (!matched) {
    result.warnings.push(place.ref.provider === "coordinates" ? "Este ponto não possui um artigo geográfico confirmado. Explore os locais próximos." : "Não foi encontrado um artigo da Wikipédia com nome e localização correspondentes.");
    return result;
  }
  const { article, language } = matched;
  const sourceUrl = articleUrl(article.title, language);
  const extract = plain(article.extract ?? "");
  result.description = extract;
  result.summary = summaryText(extract || plain(article.description ?? "", 1_200));
  result.sources.push({ title: `Wikipédia (${language.toUpperCase()})`, url: sourceUrl });
  if (!result.description) result.warnings.push("Este artigo não disponibilizou uma descrição textual.");
  const qid = article.pageprops?.wikibase_item;
  let entity: Entity | undefined;
  if (qid) {
    try {
      entity = (await entities([qid], signal))[qid];
      if (!entity) throw new WikimediaError("Entidade ausente no Wikidata.");
      result.sources.push({ title: "Wikidata", url: `https://www.wikidata.org/wiki/${qid}` });
    } catch { cancelled(signal); result.warnings.push("Os dados complementares do Wikidata estão indisponíveis."); }
  }
  const [photos, facts] = await Promise.allSettled([
    licensedPhotos(article, entity, signal),
    entity && qid ? geographicFacts(entity, qid, signal) : Promise.resolve({ facts: [] as Fact[], labelsUnavailable: false }),
  ]);
  cancelled(signal);
  if (photos.status === "fulfilled") {
    result.photos = photos.value;
    if (!result.photos.length) result.warnings.push("Nenhuma fotografia com licença e vínculo confirmados foi encontrada para este local.");
    else result.sources.push({ title: "Wikimedia Commons", url: result.photos[0].sourceUrl });
  } else result.warnings.push("Não foi possível carregar as fotografias do Wikimedia Commons.");
  if (facts.status === "fulfilled") {
    result.facts = facts.value.facts;
    if (facts.value.labelsUnavailable) result.warnings.push("Alguns nomes de regiões e países do Wikidata estão indisponíveis.");
  }
  else result.warnings.push("Não foi possível carregar todos os dados geográficos do Wikidata.");
  return result;
}
