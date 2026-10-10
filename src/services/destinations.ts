import type { Coordinates, Destination, NearbyPlace, Photo, Place, PlaceRef, SearchSuggestion, Source } from "@/types/explorer";
import { deadline, ServiceError } from "@/lib/server/http";
import { hasGoogleKey, nearbyGoogle, resolveGoogle, resolveGoogleLocation, reverseGoogle, searchGoogle } from "./google";
import { enrichWikipedia, nearbyWikipedia, resolveWikipedia, reverseWikipedia, searchWikipedia } from "./wikimedia";

const encyclopediaWarning = "Resultados da Wikipédia: a cobertura de endereços e estabelecimentos é limitada.";

function providerWarning(error: unknown): string {
  if (error instanceof ServiceError && error.code === "PROVIDER_QUOTA") return "O Google atingiu seu limite de consultas. Exibindo os dados disponíveis na Wikipédia.";
  return "A consulta ao Google está indisponível. Exibindo os dados disponíveis na Wikipédia.";
}

export async function searchDestinations(query: string, sessionToken?: string, signal?: AbortSignal): Promise<{
  suggestions: SearchSuggestion[]; provider: "google" | "wikipedia"; warnings: string[];
}> {
  signal?.throwIfAborted();
  const bounded = deadline(signal, 16_000);
  const warnings: string[] = [];
  if (hasGoogleKey()) {
    try {
      return { suggestions: await searchGoogle(query, sessionToken, bounded), provider: "google", warnings };
    } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(providerWarning(error));
    }
  }
  warnings.push(encyclopediaWarning);
  return { suggestions: await searchWikipedia(query, bounded), provider: "wikipedia", warnings };
}

export async function reverseLocation(coordinates: Coordinates, signal?: AbortSignal): Promise<Place> {
  signal?.throwIfAborted();
  const bounded = deadline(signal, 14_000);
  if (hasGoogleKey()) {
    try { return await reverseGoogle(coordinates, bounded); }
    catch (error) { if (signal?.aborted) throw error; }
  }
  // A coordinate remains useful even when neither geocoder can label it.
  try { return await reverseWikipedia(coordinates, bounded); }
  catch {
    signal?.throwIfAborted();
    return {
      ref: { provider: "coordinates", ...coordinates }, id: `coordinates:${coordinates.lat},${coordinates.lng}`,
      name: "Local selecionado", address: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
      coordinates, source: "Coordinates",
    };
  }
}

export async function resolvePlace(ref: PlaceRef, sessionToken?: string, signal?: AbortSignal): Promise<Place> {
  signal?.throwIfAborted();
  const bounded = deadline(signal, 14_000);
  if (ref.provider === "google") return resolveGoogleLocation(ref.id, sessionToken, bounded);
  if (ref.provider === "wikipedia") return resolveWikipedia(ref, bounded);
  return reverseLocation(ref, bounded);
}

async function nearbyWithFallback(place: Place, warnings: string[], signal: AbortSignal): Promise<NearbyPlace[]> {
  signal.throwIfAborted();
  if (hasGoogleKey()) {
    try {
      const results = await nearbyGoogle(place, signal);
      if (results.length) return results;
    } catch {
      signal.throwIfAborted();
      warnings.push("As atrações do Google estão indisponíveis. Consultamos artigos geográficos próximos.");
    }
  }
  return nearbyWikipedia(place, signal);
}

function googleSource(place: Place): Source {
  const coordinates = `${place.coordinates.lat},${place.coordinates.lng}`;
  const query = new URLSearchParams({ api: "1", query: coordinates });
  if (place.ref.provider === "google") query.set("query_place_id", place.ref.id);
  return { title: "Google Maps", url: `https://www.google.com/maps/search/?${query}` };
}

export async function loadDestination(ref: PlaceRef, sessionToken?: string, signal?: AbortSignal): Promise<Destination> {
  signal?.throwIfAborted();
  const bounded = deadline(signal, 22_000);
  let place: Place;
  let photos: Photo[] = [];
  if (ref.provider === "google") {
    const resolved = await resolveGoogle(ref.id, sessionToken, bounded);
    place = resolved.place;
    photos = resolved.photos;
  } else if (ref.provider === "wikipedia") {
    place = await resolveWikipedia(ref, bounded);
  } else {
    place = await reverseLocation(ref, bounded);
  }
  signal?.throwIfAborted();
  const warnings: string[] = [];
  const [enrichment, nearby] = await Promise.allSettled([
    enrichWikipedia(place, bounded),
    nearbyWithFallback(place, warnings, bounded),
  ]);
  // A provider timeout may degrade the result; an explicitly cancelled request must stop.
  signal?.throwIfAborted();
  const sourceList: Source[] = place.source === "Google Maps" ? [googleSource(place)] : [];
  if (enrichment.status === "fulfilled") {
    warnings.push(...enrichment.value.warnings);
    photos.push(...enrichment.value.photos);
    sourceList.push(...enrichment.value.sources);
  } else {
    warnings.push("O resumo e as imagens da Wikipédia não puderam ser carregados. A localização continua disponível.");
  }
  if (nearby.status === "rejected") warnings.push("Não foi possível carregar as atrações próximas agora.");
  const details = enrichment.status === "fulfilled" ? enrichment.value : undefined;
  return {
    place, summary: details?.summary || "", description: details?.description || "",
    photos: [...new Map(photos.map(photo => [photo.id, photo])).values()].slice(0, 16),
    nearby: nearby.status === "fulfilled" ? nearby.value : [],
    facts: details?.facts ?? [], sources: [...new Map(sourceList.map(source => [source.url, source])).values()],
    warnings: [...new Set(warnings)],
  };
}
