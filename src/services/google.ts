import type { Coordinates, NearbyPlace, Photo, Place, SearchSuggestion } from "@/types/explorer";
import { fetchJson, ServiceError } from "@/lib/server/http";
import { photoNameSchema } from "@/lib/server/validation";

const placesBase = "https://places.googleapis.com/v1";
type GooglePhoto = {
  name: string; widthPx?: number; heightPx?: number;
  authorAttributions?: { displayName?: string; uri?: string }[];
};
type GooglePlace = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string;
  location?: { latitude?: number; longitude?: number }; primaryType?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  photos?: GooglePhoto[]; googleMapsUri?: string;
};
type GeocodeResult = {
  place_id?: string; formatted_address?: string; types?: string[];
  address_components?: { long_name?: string; types?: string[] }[];
};

export function hasGoogleKey(): boolean { return Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim()); }

function key(): string {
  const value = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();
  if (!value) throw new ServiceError("GOOGLE_UNAVAILABLE", "A busca do Google não está configurada neste ambiente.", 503);
  return value;
}

function headers(fieldMask?: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": key(),
    ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
  };
}

const placeFields = "id,displayName,formattedAddress,location,addressComponents,primaryType,photos,googleMapsUri";

export function googlePlaceToPlace(raw: GooglePlace): Place {
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  if (!raw.id || !/^[A-Za-z0-9_-]{1,256}$/.test(raw.id) || typeof lat !== "number" || typeof lng !== "number"
    || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ServiceError("INVALID_PROVIDER_DATA", "O serviço não retornou coordenadas para este lugar.");
  }
  const component = (type: string) => raw.addressComponents?.find(item => item.types?.includes(type))?.longText;
  return {
    ref: { provider: "google", id: raw.id }, id: `google:${raw.id}`,
    name: raw.displayName?.text || raw.formattedAddress || "Lugar selecionado",
    address: raw.formattedAddress || "", country: component("country"),
    region: component("administrative_area_level_1"), kind: raw.primaryType,
    coordinates: { lat, lng }, source: "Google Maps",
  };
}

function safeWebUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function googlePhotos(raw: GooglePlace): Photo[] {
  const sourceUrl = safeWebUrl(raw.googleMapsUri) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw.displayName?.text || "Lugar")}&query_place_id=${encodeURIComponent(raw.id || "")}`;
  return (raw.photos ?? []).slice(0, 8).flatMap(photo => {
    if (!photoNameSchema.safeParse(photo.name).success) return [];
    const authors = photo.authorAttributions ?? [];
    const attributions = authors.flatMap(author => author.displayName ? [{ name: author.displayName, url: safeWebUrl(author.uri) }] : []);
    const path = `/api/photo?name=${encodeURIComponent(photo.name)}`;
    return [{
      id: photo.name, url: `${path}&width=1600`, thumbnailUrl: `${path}&width=600`,
      width: photo.widthPx || 1600, height: photo.heightPx || 1000,
      alt: raw.displayName?.text || "Fotografia do destino", source: "Google Places" as const,
      author: authors.map(author => author.displayName).filter(Boolean).join(", ") || "Google Maps",
      authorUrl: safeWebUrl(authors[0]?.uri), license: "Google Places · direitos dos respectivos autores",
      sourceUrl, attributions,
    }];
  });
}

export async function searchGoogle(query: string, sessionToken?: string, signal?: AbortSignal): Promise<SearchSuggestion[]> {
  const data = await fetchJson<{ suggestions?: { placePrediction?: {
    placeId?: string; text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  } }[] }>(`${placesBase}/places:autocomplete`, {
    method: "POST", headers: headers("suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"), signal,
    body: JSON.stringify({ input: query, languageCode: "pt-BR", includeQueryPredictions: false, ...(sessionToken ? { sessionToken } : {}) }),
  });
  return (data.suggestions ?? []).flatMap(item => {
    const result = item.placePrediction;
    if (!result?.placeId || !/^[A-Za-z0-9_-]{1,256}$/.test(result.placeId)) return [];
    return [{ ref: { provider: "google" as const, id: result.placeId }, label: result.structuredFormat?.mainText?.text || result.text?.text || query, description: result.structuredFormat?.secondaryText?.text || "" }];
  }).slice(0, 8);
}

export async function resolveGoogle(id: string, sessionToken?: string, signal?: AbortSignal): Promise<{ place: Place; photos: Photo[] }> {
  const url = new URL(`${placesBase}/places/${encodeURIComponent(id)}`);
  url.searchParams.set("languageCode", "pt-BR");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const raw = await fetchJson<GooglePlace>(url, { headers: headers(placeFields), signal });
  return { place: googlePlaceToPlace(raw), photos: googlePhotos(raw) };
}

export async function resolveGoogleLocation(id: string, sessionToken?: string, signal?: AbortSignal): Promise<Place> {
  const url = new URL(`${placesBase}/places/${encodeURIComponent(id)}`);
  url.searchParams.set("languageCode", "pt-BR");
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const raw = await fetchJson<GooglePlace>(url, {
    headers: headers("id,displayName,formattedAddress,location,addressComponents,primaryType"), signal,
  });
  return googlePlaceToPlace(raw);
}

function distanceBetween(a: Coordinates, b: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const half = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(half), Math.sqrt(Math.max(0, 1 - half))));
}

export async function nearbyGoogle(place: Place, signal?: AbortSignal): Promise<NearbyPlace[]> {
  const data = await fetchJson<{ places?: GooglePlace[] }>(`${placesBase}/places:searchNearby`, {
    method: "POST", headers: headers(placeFields.split(",").map(field => `places.${field}`).join(",")), signal,
    body: JSON.stringify({
      languageCode: "pt-BR", includedTypes: ["tourist_attraction", "museum", "park", "art_gallery", "zoo", "aquarium", "amusement_park"],
      maxResultCount: 12, rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: place.coordinates.lat, longitude: place.coordinates.lng }, radius: 8_000 } },
    }),
  });
  return (data.places ?? []).flatMap(raw => {
    if (!raw.id || (place.ref.provider === "google" && raw.id === place.ref.id)) return [];
    try {
      const nearby = googlePlaceToPlace(raw);
      return [{ place: nearby, photo: googlePhotos(raw)[0], distanceMeters: distanceBetween(place.coordinates, nearby.coordinates) }];
    } catch { return []; }
  });
}

export async function reverseGoogle(coordinates: Coordinates, signal?: AbortSignal): Promise<Place> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${coordinates.lat},${coordinates.lng}`);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("key", key());
  const data = await fetchJson<{ status?: string; results?: GeocodeResult[] }>(url, { signal });
  if (data.status === "OVER_QUERY_LIMIT" || data.status === "OVER_DAILY_LIMIT") {
    throw new ServiceError("PROVIDER_QUOTA", "O serviço atingiu seu limite de consultas.", 503);
  }
  if (data.status === "REQUEST_DENIED") throw new ServiceError("PROVIDER_AUTH", "O serviço de geocodificação está indisponível.", 503);
  if (data.status !== "OK" || !data.results?.length) throw new ServiceError("NOT_FOUND", "Nenhum endereço encontrado nestas coordenadas.", 404);
  const raw = data.results[0];
  const component = (type: string) => raw.address_components?.find(item => item.types?.includes(type))?.long_name;
  const name = component("point_of_interest") || component("premise") || component("locality") || component("administrative_area_level_2") || raw.formatted_address || "Local selecionado";
  return {
    // Preserve the clicked location; a geocoded address may have a different centroid.
    ref: { provider: "coordinates", ...coordinates }, id: `coordinates:${coordinates.lat},${coordinates.lng}`,
    name, address: raw.formatted_address || "", country: component("country"),
    region: component("administrative_area_level_1"), kind: raw.types?.[0], coordinates, source: "Google Maps",
  };
}

export function isAllowedPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    const hasCredentials = [...url.searchParams.keys()].some(name => /^(key|api[_-]?key|access[_-]?token)$/i.test(name));
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !hasCredentials && (
      host === "googleusercontent.com" || host.endsWith(".googleusercontent.com") || host === "maps.gstatic.com"
    );
  } catch { return false; }
}

export async function getGooglePhotoUrl(name: string, width: number, signal?: AbortSignal): Promise<string> {
  // Validate in the service too so a future caller cannot turn this into a proxy.
  if (!photoNameSchema.safeParse(name).success || !Number.isInteger(width) || width < 100 || width > 2_000) {
    throw new ServiceError("INVALID_INPUT", "Referência de imagem inválida.", 400);
  }
  const url = new URL(`${placesBase}/${name}/media`);
  url.searchParams.set("maxWidthPx", String(width));
  url.searchParams.set("skipHttpRedirect", "true");
  const data = await fetchJson<{ photoUri?: string }>(url, { headers: headers(), signal });
  if (typeof data.photoUri !== "string" || !isAllowedPhotoUrl(data.photoUri) || data.photoUri.includes(key())) {
    throw new ServiceError("INVALID_PHOTO", "A imagem retornada pelo serviço não está disponível.", 502);
  }
  return data.photoUri;
}
