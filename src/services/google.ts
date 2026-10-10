import { z } from 'zod';
import { ApiError } from '../lib/errors';
import { upstreamJson } from '../lib/upstream';
import type { Coordinates, Location, NearbyPlace, Photo, PlaceReference, SearchSuggestion } from '../types/explorer';

const PLACES_API = 'https://places.googleapis.com/v1';
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]{1,512}\/photos\/[A-Za-z0-9_-]{1,4096}$/;
const SESSION_TOKEN_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const coordinateSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
const selectedCoordinateSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();
const textSchema = z.object({ text: z.string().max(8_000) });
const attributionSchema = z.object({
  displayName: z.string().max(2_000).optional(),
  uri: z.string().max(8_000).optional(),
});
const photoSchema = z.object({
  name: z.string().regex(PHOTO_NAME_PATTERN),
  widthPx: z.number().int().positive().max(100_000),
  heightPx: z.number().int().positive().max(100_000),
  authorAttributions: z.array(attributionSchema).max(100).optional(),
  googleMapsUri: z.string().max(8_000).optional(),
});
const placeSchema = z.object({
  id: z.string().regex(PLACE_ID_PATTERN),
  displayName: textSchema.optional(),
  formattedAddress: z.string().max(8_000).optional(),
  location: coordinateSchema,
  types: z.array(z.string().max(200)).max(100).optional(),
  addressComponents: z.array(z.object({
    longText: z.string().max(2_000),
    shortText: z.string().max(2_000).optional(),
    types: z.array(z.string().max(200)).max(100),
  })).max(100).optional(),
  photos: z.array(photoSchema).max(100).optional(),
  attributions: z.array(z.object({
    provider: z.string().max(2_000),
    providerUri: z.string().max(8_000).optional(),
  })).max(100).optional(),
  googleMapsUri: z.string().max(8_000).optional(),
});
const autocompleteSchema = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: z.string().regex(PLACE_ID_PATTERN),
      text: textSchema.optional(),
      structuredFormat: z.object({
        mainText: textSchema,
        secondaryText: textSchema.optional(),
      }).optional(),
    }).optional(),
  })).max(100).optional(),
});
const reverseSchema = z.object({
  status: z.string().max(100),
  results: z.array(z.object({
    place_id: z.string().regex(PLACE_ID_PATTERN).optional(),
    formatted_address: z.string().max(8_000).optional(),
    types: z.array(z.string().max(200)).max(100).optional(),
    address_components: z.array(z.object({
      long_name: z.string().max(2_000),
      short_name: z.string().max(2_000).optional(),
      types: z.array(z.string().max(200)).max(100),
    })).max(100).optional(),
  })).max(100).optional(),
});
const DETAILS_FIELDS = 'id,displayName,formattedAddress,location,types,addressComponents,photos,attributions,googleMapsUri';
// These are supported Nearby Search (New) filter types. Geocoding's
// `natural_feature` is intentionally not used as a Nearby Search filter.
const NEARBY_TYPES = ['tourist_attraction', 'museum', 'park'];

type GooglePlaceResponse = z.infer<typeof placeSchema>;
export interface GooglePlace { location: Location; photos: Photo[] }

function cleanText(value: string | undefined): string {
  // eslint-disable-next-line no-control-regex -- Strip control characters from untrusted provider text.
  return (value ?? '').replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch { return undefined; }
}

function serverKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!key) throw new ApiError('GOOGLE_NOT_CONFIGURED', 'Configure a chave do Google Maps para usar este serviço.', 503);
  return key;
}

function checkedSessionToken(sessionToken: string | undefined): string | undefined {
  if (sessionToken && !SESSION_TOKEN_PATTERN.test(sessionToken)) {
    throw new ApiError('INVALID_SESSION_TOKEN', 'A sessão de busca é inválida.', 400);
  }
  return sessionToken;
}

function checkedPlaceId(id: string): string {
  if (!PLACE_ID_PATTERN.test(id)) throw new ApiError('INVALID_PLACE_ID', 'O identificador do local é inválido.', 400);
  return id;
}

function parsedResponse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError('INVALID_GOOGLE_RESPONSE', 'O Google retornou dados inválidos para este local.', 502);
  return parsed.data;
}

function coordinateName(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(4)}°, ${coordinates.lng.toFixed(4)}°`;
}

function mapsUrl(id: string): string {
  return `https://www.google.com/maps/search/?api=1&query=place&query_place_id=${encodeURIComponent(id)}`;
}

function kindOf(types: string[] | undefined): string {
  if (types?.includes('country')) return 'country';
  if (types?.includes('locality') || types?.includes('postal_town')) return 'city';
  if (types?.includes('administrative_area_level_1') || types?.includes('administrative_area_level_2')) return 'region';
  if (types?.includes('natural_feature')) return 'natural';
  if (types?.includes('park') || types?.includes('national_park')) return 'park';
  return types?.[0] ?? 'place';
}

function placeLocation(place: GooglePlaceResponse): Location {
  const coordinates = { lat: place.location.latitude, lng: place.location.longitude };
  const component = (type: string) => cleanText(place.addressComponents?.find(item => item.types.includes(type))?.longText) || undefined;
  const providers = place.attributions?.map(item => {
    const provider = cleanText(item.provider);
    const uri = safeUrl(item.providerUri);
    return provider ? `${provider}${uri ? ` — ${uri}` : ''}` : '';
  }).filter(Boolean) ?? [];
  return {
    reference: { provider: 'google', id: place.id },
    name: cleanText(place.displayName?.text) || cleanText(place.formattedAddress) || coordinateName(coordinates),
    address: cleanText(place.formattedAddress) || undefined,
    country: component('country'),
    region: component('administrative_area_level_1'),
    coordinates,
    kind: kindOf(place.types),
    sourceUrl: safeUrl(place.googleMapsUri) ?? mapsUrl(place.id),
    attributions: ['Google Maps', ...providers],
  };
}

function placePhotos(place: GooglePlaceResponse, location: Location): Photo[] {
  const unique = [...new Map((place.photos ?? []).map(photo => [photo.name, photo])).values()];
  const adequatelySized = unique.filter(photo => photo.widthPx >= 640);
  // Prefer useful landscape photographs and avoid tiny versions when a
  // larger photograph is available. Preserve honest, small-image results
  // when the provider has no larger alternative for this exact place.
  const selected = (adequatelySized.length ? adequatelySized : unique).sort((a, b) => {
    const landscapePreference = Number(b.widthPx >= b.heightPx) - Number(a.widthPx >= a.heightPx);
    return landscapePreference || (b.widthPx * b.heightPx - a.widthPx * a.heightPx);
  }).slice(0, 8);
  return selected.map(photo => {
    const authorAttributions = (photo.authorAttributions ?? []).map(author => ({ name: cleanText(author.displayName), url: safeUrl(author.uri) })).filter(author => author.name);
    const attributionUrl = authorAttributions.map(author => author.url).find(Boolean);
    const sourceUrl = safeUrl(photo.googleMapsUri) ?? location.sourceUrl ?? mapsUrl(place.id);
    return {
      id: photo.name,
      // References are retrieved fresh for each destination; image bytes/URLs
      // are fetched on demand by the server, never using a browser API key.
      url: `/api/photos?name=${encodeURIComponent(photo.name)}&width=1600`,
      thumbnailUrl: `/api/photos?name=${encodeURIComponent(photo.name)}&width=600`,
      width: photo.widthPx,
      height: photo.heightPx,
      alt: location.name,
      author: authorAttributions.map(author => author.name).join(', ') || 'Google Maps',
      authorUrl: attributionUrl,
      authorAttributions,
      license: 'Google Maps — direitos dos autores',
      licenseUrl: 'https://www.google.com/help/terms_maps/',
      sourceUrl,
      provider: 'google',
    };
  });
}

export async function googleSearch(query: string, sessionToken?: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const input = query.trim();
  if (input.length < 2 || input.length > 200) throw new ApiError('INVALID_QUERY', 'Informe uma busca entre 2 e 200 caracteres.', 400);
  const token = checkedSessionToken(sessionToken);
  const response = await upstreamJson(`${PLACES_API}/places:autocomplete`, {
    signal,
    init: {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': serverKey(), 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat' },
      body: JSON.stringify({ input, languageCode: 'pt-BR', ...(token ? { sessionToken: token } : {}) }),
    },
  });
  const data = parsedResponse(autocompleteSchema, response);
  return (data.suggestions ?? []).flatMap(suggestion => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return [];
    const title = cleanText(prediction.structuredFormat?.mainText.text ?? prediction.text?.text);
    if (!title) return [];
    return [{ reference: { provider: 'google' as const, id: prediction.placeId }, title, subtitle: cleanText(prediction.structuredFormat?.secondaryText?.text) }];
  }).slice(0, 8);
}

export async function googleDetails(id: string, sessionToken?: string, signal?: AbortSignal): Promise<GooglePlace> {
  const placeId = checkedPlaceId(id);
  const token = checkedSessionToken(sessionToken);
  const url = new URL(`${PLACES_API}/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set('languageCode', 'pt-BR');
  if (token) url.searchParams.set('sessionToken', token);
  const response = await upstreamJson(url, {
    signal,
    init: { cache: 'no-store', headers: { 'X-Goog-Api-Key': serverKey(), 'X-Goog-FieldMask': DETAILS_FIELDS } },
  });
  const place = parsedResponse(placeSchema, response);
  if (place.id !== placeId) throw new ApiError('INVALID_GOOGLE_RESPONSE', 'O Google retornou outro identificador de local.', 502);
  const location = placeLocation(place);
  return { location, photos: placePhotos(place, location) };
}

export async function googleResolve(reference: PlaceReference, sessionToken?: string, signal?: AbortSignal): Promise<Location> {
  if (reference.provider === 'google') return (await googleDetails(reference.id, sessionToken, signal)).location;
  if (reference.provider === 'coordinates') return googleReverse({ lat: reference.lat, lng: reference.lng }, signal);
  throw new ApiError('INVALID_PLACE_PROVIDER', 'Este local usa outro provedor de pesquisa.', 400);
}

export async function googleReverse(coordinates: Coordinates, signal?: AbortSignal): Promise<Location> {
  if (!selectedCoordinateSchema.safeParse(coordinates).success) throw new ApiError('INVALID_COORDINATES', 'As coordenadas selecionadas são inválidas.', 400);
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${coordinates.lat},${coordinates.lng}`);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', serverKey());
  const response = parsedResponse(reverseSchema, await upstreamJson(url, {
    signal, init: { cache: 'no-store' },
  }));
  if (response.status === 'OVER_QUERY_LIMIT' || response.status === 'OVER_DAILY_LIMIT') {
    throw new ApiError('GOOGLE_QUOTA', 'O limite de consultas do Google foi atingido. Tente novamente mais tarde.', 429, 60);
  }
  if (!['OK', 'ZERO_RESULTS'].includes(response.status)) {
    throw new ApiError('GOOGLE_GEOCODING_FAILED', 'O Google não conseguiu identificar este ponto do mapa.', 502);
  }
  const result = response.results?.[0];
  const component = (types: string[]) => cleanText(result?.address_components?.find(item => types.some(type => item.types.includes(type)))?.long_name) || undefined;
  // A click's exact coordinates are retained, including over the ocean. No
  // nearby city's coordinates or name are substituted for an unmapped point.
  return {
    reference: { provider: 'coordinates', ...coordinates },
    name: component(['locality', 'postal_town', 'natural_feature', 'establishment']) ?? (cleanText(result?.formatted_address) || coordinateName(coordinates)),
    address: cleanText(result?.formatted_address) || undefined,
    country: component(['country']),
    region: component(['administrative_area_level_1']),
    coordinates: { ...coordinates },
    kind: result ? kindOf(result.types) : 'coordinates',
    sourceUrl: result?.place_id ? mapsUrl(result.place_id) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${coordinates.lat},${coordinates.lng}`)}`,
    attributions: ['Google Maps'],
  };
}

function distanceKm(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latDifference = radians(b.lat - a.lat);
  const lngDifference = radians(b.lng - a.lng);
  const haversine = Math.sin(latDifference / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lngDifference / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

export async function googleNearby(location: Location, signal?: AbortSignal): Promise<NearbyPlace[]> {
  if (!selectedCoordinateSchema.safeParse(location.coordinates).success) throw new ApiError('INVALID_COORDINATES', 'As coordenadas selecionadas são inválidas.', 400);
  const response = await upstreamJson(`${PLACES_API}/places:searchNearby`, {
    signal,
    init: {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': serverKey(), 'X-Goog-FieldMask': DETAILS_FIELDS.split(',').map(field => `places.${field}`).join(',') },
      body: JSON.stringify({
        includedTypes: NEARBY_TYPES, maxResultCount: 8, languageCode: 'pt-BR', rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: location.coordinates.lat, longitude: location.coordinates.lng }, radius: 15_000 } },
      }),
    },
  });
  const places = parsedResponse(z.object({ places: z.array(placeSchema).max(20).optional() }), response).places ?? [];
  const currentId = location.reference.provider === 'google' ? location.reference.id : undefined;
  return places.filter(place => place.id !== currentId).map(place => {
    const nearbyLocation = placeLocation(place);
    return { location: nearbyLocation, photo: placePhotos(place, nearbyLocation)[0], distanceKm: distanceKm(location.coordinates, nearbyLocation.coordinates) };
  });
}

export async function googlePhotoUrl(name: string, maxWidth = 1_600, signal?: AbortSignal): Promise<string> {
  if (!PHOTO_NAME_PATTERN.test(name)) throw new ApiError('INVALID_PHOTO_REFERENCE', 'A referência da imagem é inválida.', 400);
  if (!Number.isInteger(maxWidth) || maxWidth < 1 || maxWidth > 4_800) throw new ApiError('INVALID_PHOTO_WIDTH', 'A dimensão da imagem é inválida.', 400);
  const url = new URL(`${PLACES_API}/${name}/media`);
  url.searchParams.set('maxWidthPx', String(maxWidth));
  url.searchParams.set('skipHttpRedirect', 'true');
  const response = parsedResponse(z.object({ photoUri: z.string().max(16_000) }), await upstreamJson(url, {
    signal, init: { cache: 'no-store', headers: { 'X-Goog-Api-Key': serverKey() } },
  }));
  const photoUri = safeUrl(response.photoUri);
  const hostname = photoUri ? new URL(photoUri).hostname : '';
  if (!photoUri || !(hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com'))) {
    throw new ApiError('INVALID_GOOGLE_RESPONSE', 'O Google retornou um endereço inválido de imagem.', 502);
  }
  return photoUri;
}
