export type Coordinates = { lat: number; lng: number };
export type PlaceRef =
  | { provider: "google"; id: string }
  | { provider: "wikipedia"; id: string; language: "pt" | "en" }
  | { provider: "coordinates"; lat: number; lng: number };
export type Place = {
  ref: PlaceRef;
  id: string;
  name: string;
  address: string;
  country?: string;
  region?: string;
  kind?: string;
  coordinates: Coordinates;
  source: "Google Maps" | "Wikipedia" | "Coordinates";
};
export type SearchSuggestion = { ref: PlaceRef; label: string; description: string };
export type Photo = {
  id: string; url: string; thumbnailUrl: string; width: number; height: number;
  alt: string; source: "Google Places" | "Wikimedia Commons";
  author: string; authorUrl?: string; license: string; sourceUrl: string;
  attributions?: { name: string; url?: string }[];
};
export type NearbyPlace = { place: Place; photo?: Photo; distanceMeters?: number };
export type Source = { title: string; url: string };
export type Fact = { label: string; value: string; sourceUrl: string };
export type Destination = {
  place: Place; summary: string; description: string; photos: Photo[];
  nearby: NearbyPlace[]; facts: Fact[]; sources: Source[]; warnings: string[];
};
export type AppConfig = { googleMapsKey: string; googlePlacesEnabled: boolean };
export type ApiError = { error: string; code: string; retryAfter?: number };
