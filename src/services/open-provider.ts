import { ApiError } from '@/lib/errors';
import type { ContentSection, Coordinates, Destination, Location, NearbyPlace, PlaceReference, SearchSuggestion, ServiceWarning, Source } from '@/types/explorer';
import { abortIfRequested, articleLocation, geoLocation, geoWikipedia, getWikipediaArticle, plainText, searchWikipedia, type WikiArticle, type GeoArticle } from './wikipedia';
import { getWikidataContent, type WikidataContent } from './wikidata';
import { getCommonsCategoryFiles, getCommonsPhotos } from './media';

type Enrichment = Pick<Destination, 'summary' | 'sections' | 'photos' | 'nearby' | 'facts' | 'sources' | 'warnings'>;
function checkedCoordinates(coordinates: Coordinates): Coordinates {
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng) || Math.abs(coordinates.lat) > 90 || Math.abs(coordinates.lng) > 180) throw new ApiError('INVALID_COORDINATES', 'Informe coordenadas geográficas válidas.', 400);
  return { lat: coordinates.lat, lng: coordinates.lng };
}
function coordinateFacts(coordinates: Coordinates) {
  return [{ label: 'Latitude', value: `${coordinates.lat.toFixed(6)}°`, sourceUrl: `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=12/${coordinates.lat}/${coordinates.lng}` }, { label: 'Longitude', value: `${coordinates.lng.toFixed(6)}°`, sourceUrl: `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=12/${coordinates.lat}/${coordinates.lng}` }];
}

export async function openSearch(query: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  if (text.length > 160) throw new ApiError('INVALID_QUERY', 'A pesquisa deve ter até 160 caracteres.', 400);
  const results: SearchSuggestion[] = [];
  let firstError: unknown;
  for (const language of ['pt', 'en'] as const) {
    try { results.push(...await searchWikipedia(text, language, signal)); } catch (error) { abortIfRequested(signal); firstError ??= error; }
    if (results.length >= 8) break;
  }
  if (!results.length && firstError) throw firstError;
  const seen = new Set<string>();
  return results.filter((suggestion) => { const key = suggestion.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 8);
}

export async function openResolve(reference: PlaceReference, signal?: AbortSignal): Promise<Location> {
  if (reference.provider === 'coordinates') return openReverse(reference, signal);
  if (reference.provider !== 'wikipedia') throw new ApiError('INVALID_PROVIDER', 'Este identificador pertence a outro provedor.', 400);
  if (!/^[1-9]\d{0,15}$/.test(reference.id)) throw new ApiError('INVALID_REFERENCE', 'O identificador geográfico é inválido.', 400);
  return articleLocation(await getWikipediaArticle(reference.id, reference.language, signal));
}

async function nearbyArticles(coordinates: Coordinates, radiusMeters: number, limit: number, signal?: AbortSignal): Promise<GeoArticle[]> {
  let ptError: unknown;
  try { const articles = await geoWikipedia(coordinates, 'pt', radiusMeters, limit, signal); if (articles.length) return articles; } catch (error) { abortIfRequested(signal); ptError = error; }
  try { return await geoWikipedia(coordinates, 'en', radiusMeters, limit, signal); } catch (error) { abortIfRequested(signal); throw ptError ?? error; }
}

export async function openReverse(input: Coordinates, signal?: AbortSignal): Promise<Location> {
  const coordinates = checkedCoordinates(input);
  const location: Location = { reference: { provider: 'coordinates', ...coordinates }, name: 'Ponto no mapa', coordinates, kind: 'Coordenadas selecionadas', attributions: ['Coordenadas selecionadas pelo usuário'] };
  try {
    const nearest = (await nearbyArticles(coordinates, 1000, 3, signal))[0];
    if (nearest) { location.name = `Ponto próximo a ${nearest.title}`; location.kind = `Coordenadas selecionadas · ${Math.round(nearest.distanceKm * 1000)} m de um local documentado`; }
  } catch { abortIfRequested(signal); /* A reverse lookup outage must preserve the usable selected point. */ }
  return location;
}

function textSections(extract: string): { summary: string; sections: ContentSection[] } {
  const text = plainText(extract, 24000);
  const pieces = text.split(/\n\s*={2,}\s*([^=\n]+?)\s*={2,}\s*\n/);
  const lead = pieces[0]?.trim() ?? '';
  const sections: ContentSection[] = [];
  for (let index = 1; index < pieces.length - 1; index += 2) {
    const title = plainText(pieces[index], 150);
    const body = plainText(pieces[index + 1], 2400);
    if (title && body && !/^(?:referências|ligações externas|bibliografia|notas|ver também|references|external links|see also|notes)$/i.test(title)) sections.push({ title, text: body });
    if (sections.length >= 5) break;
  }
  const paragraphs = lead.split(/\n\s*\n/).filter(Boolean);
  const summary = paragraphs[0]?.slice(0, 1100) ?? '';
  if (paragraphs.length > 1) sections.unshift({ title: 'Sobre o local', text: paragraphs.slice(1).join('\n\n').slice(0, 2400) });
  return { summary, sections: sections.slice(0, 5) };
}

function warning(service: string, message: string): ServiceWarning { return { service, message }; }
async function nearbyWithPhotos(location: Location, warnings: ServiceWarning[], signal?: AbortSignal): Promise<NearbyPlace[]> {
  let articles: GeoArticle[];
  try { articles = await nearbyArticles(location.coordinates, 10000, 10, signal); } catch { abortIfRequested(signal); warnings.push(warning('Wikipedia', 'Não foi possível consultar locais próximos agora.')); return []; }
  const candidates = articles.filter((article) => !(location.reference.provider === 'wikipedia' && location.reference.language === article.language && location.reference.id === String(article.pageid))).slice(0, 4);
  return Promise.all(candidates.map(async (article) => {
    const nearby: NearbyPlace = { location: geoLocation(article), distanceKm: article.distanceKm };
    try { const details = await getWikipediaArticle(String(article.pageid), article.language, signal); nearby.location = articleLocation(details); const files = details.page.pageimage ? [details.page.pageimage] : []; nearby.photo = (await getCommonsPhotos(files, article.title, signal))[0]; } catch { abortIfRequested(signal); }
    return nearby;
  }));
}

function normalizedName(name: string): string { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

export async function enrichOpenLocation(location: Location, signal?: AbortSignal): Promise<Enrichment> {
  checkedCoordinates(location.coordinates);
  abortIfRequested(signal);
  const warnings: ServiceWarning[] = [];
  const sources: Source[] = [];
  let article: WikiArticle | undefined;
  if (location.reference.provider === 'wikipedia') {
    try { article = await getWikipediaArticle(location.reference.id, location.reference.language, signal); } catch { abortIfRequested(signal); warnings.push(warning('Wikipedia', 'Não foi possível recuperar o conteúdo enciclopédico agora.')); }
  } else if (location.reference.provider === 'google' || (location.reference.provider === 'coordinates' && location.attributions.includes('Google Maps') && location.kind !== 'coordinates')) {
    try {
      const names = normalizedName(location.name);
      const match = (await nearbyArticles(location.coordinates, 1000, 10, signal)).find((candidate) => normalizedName(candidate.title) === names);
      if (match) article = await getWikipediaArticle(String(match.pageid), match.language, signal);
    } catch { abortIfRequested(signal); warnings.push(warning('Wikipedia', 'Não foi possível consultar conteúdo complementar agora.')); }
  }
  // Attach both handlers immediately: a canceled background lookup cannot become an unhandled rejection.
  const nearbyPromise = nearbyWithPhotos(location, warnings, signal).then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: [] as NearbyPlace[], error }),
  );
  let wikidata: WikidataContent = { facts: [], sources: [], images: [] };
  if (article?.page.pageprops?.wikibase_item) {
    try { wikidata = await getWikidataContent(article.page.pageprops.wikibase_item, signal); } catch { abortIfRequested(signal); warnings.push(warning('Wikidata', 'Os dados estruturados estão indisponíveis; o conteúdo restante foi preservado.')); }
  }
  if (article) sources.push({ name: `Wikipedia (${article.language === 'pt' ? 'português' : 'inglês'}) · CC BY-SA`, url: article.url });
  sources.push(...wikidata.sources);
  warnings.push(...(wikidata.warnings ?? []));
  if (wikidata.country) location.country = wikidata.country;
  if (wikidata.region) location.region = wikidata.region;
  const content = article ? textSections(article.page.extract ?? '') : { summary: '', sections: [] };
  if (article?.language === 'en') warnings.push(warning('Conteúdo', 'O conteúdo enciclopédico disponível está em inglês.'));
  let photos: Destination['photos'] = [];
  const files = article ? [...wikidata.images, ...(article.page.pageimage ? [article.page.pageimage] : [])] : [];
  const primaryFiles = [...files];
  if (article && wikidata.commonsCategory) {
    try { files.push(...await getCommonsCategoryFiles(wikidata.commonsCategory, signal)); } catch { abortIfRequested(signal); warnings.push(warning('Wikimedia Commons', 'A galeria da categoria vinculada ao local não pôde ser consultada.')); }
  }
  if (files.length) {
    try { photos = await getCommonsPhotos(files, location.name, signal, primaryFiles); } catch { abortIfRequested(signal); warnings.push(warning('Wikimedia Commons', 'Não foi possível consultar fotografias licenciadas agora.')); }
  }
  if (!photos.length) warnings.push(warning('Fotografias', 'Não foram encontradas fotografias adequadas e licenciadas para este local.'));
  else sources.push({ name: 'Wikimedia Commons · fotografias e licenças', url: wikidata.commonsCategory ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(`Category:${wikidata.commonsCategory}`.replace(/ /g, '_'))}` : photos[0].sourceUrl });
  if (!content.summary) {
    if (location.reference.provider === 'coordinates') content.summary = `Você selecionou o ponto ${location.coordinates.lat.toFixed(5)}°, ${location.coordinates.lng.toFixed(5)}°. Não há uma identidade enciclopédica confirmada para estas coordenadas. Os locais próximos, quando disponíveis, são apresentados separadamente com suas distâncias.`;
    else content.summary = 'Não foi encontrado um resumo enciclopédico confirmado para este local. As coordenadas e os dados disponíveis continuam acessíveis.';
    warnings.push(warning('Conteúdo', 'As informações documentadas sobre este ponto são limitadas.'));
  }
  const nearbyResult = await nearbyPromise;
  if (nearbyResult.error) throw nearbyResult.error;
  const nearby = nearbyResult.value;
  abortIfRequested(signal);
  return { ...content, photos, nearby, facts: [...coordinateFacts(location.coordinates), ...wikidata.facts], sources, warnings };
}
