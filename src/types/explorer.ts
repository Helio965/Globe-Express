export interface Coordinates { lat: number; lng: number }
export type Language = 'pt' | 'en';
export type PlaceReference =
  | { provider: 'google'; id: string }
  | { provider: 'wikipedia'; id: string; language: Language }
  | { provider: 'coordinates'; lat: number; lng: number };
export interface SearchSuggestion { reference: PlaceReference; title: string; subtitle: string }
export interface Location {
  reference: PlaceReference;
  name: string;
  address?: string;
  country?: string;
  region?: string;
  coordinates: Coordinates;
  kind: string;
  sourceUrl?: string;
  attributions: string[];
}
export interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  alt: string;
  author: string;
  authorUrl?: string;
  authorAttributions?: Array<{ name: string; url?: string }>;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  provider: 'commons' | 'google';
}
export interface Source { name: string; url: string }
export interface Fact { label: string; value: string; sourceUrl: string }
export interface ContentSection { title: string; text: string }
export interface ServiceWarning { service: string; message: string }
export interface NearbyPlace { location: Location; photo?: Photo; distanceKm?: number }
export interface Destination {
  location: Location;
  summary: string;
  sections: ContentSection[];
  photos: Photo[];
  nearby: NearbyPlace[];
  facts: Fact[];
  sources: Source[];
  warnings: ServiceWarning[];
}
export interface ExplorerConfig {
  mapProvider: 'google' | 'open';
  googleConfigured: boolean;
  googleBrowserKeyPresent: boolean;
  googleServerKeyPresent: boolean;
}
export interface ApiErrorBody { error: { code: string; message: string; retryAfter?: number } }
export interface ApiSuccess<T> { data: T }
