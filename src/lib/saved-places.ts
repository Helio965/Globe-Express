import type { PlaceReference } from '@/types/explorer';
import { referenceSchema } from './validation';
import { referenceKey } from './format';
export const FAVORITES_KEY = 'world-explorer:favorites:v1';
export const RECENT_KEY = 'world-explorer:recent:v1';
export const STORAGE_EVENT = 'world-explorer:saved-places';
export interface PlaceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function parseSavedPlaces(raw: string | null): PlaceReference[] {
  if (!raw || raw.length > 50_000) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, PlaceReference>();
    for (const entry of parsed.slice(0, 80)) {
      const reference = referenceSchema.safeParse(entry);
      if (reference.success) unique.set(referenceKey(reference.data), reference.data);
    }
    return [...unique.values()].slice(0, 50);
  } catch { return []; }
}
export function readSavedPlaces(storage: PlaceStorage, key: string): PlaceReference[] {
  try { return parseSavedPlaces(storage.getItem(key)); } catch { return []; }
}
export function savePlaces(storage: PlaceStorage, key: string, places: PlaceReference[]): boolean {
  try {
    // Only provider identifiers or user-selected coordinates survive storage.
    // Google names, addresses, images, and descriptions are never persisted.
    const validated = parseSavedPlaces(JSON.stringify(places));
    storage.setItem(key, JSON.stringify(validated));
    return true;
  } catch { return false; }
}
export function toggleSavedPlace(places: PlaceReference[], reference: PlaceReference): PlaceReference[] {
  const key = referenceKey(reference);
  return places.some(item => referenceKey(item) === key)
    ? places.filter(item => referenceKey(item) !== key)
    : [reference, ...places].slice(0, 50);
}
export function rememberPlace(places: PlaceReference[], reference: PlaceReference): PlaceReference[] {
  return [reference, ...places.filter(item => referenceKey(item) !== referenceKey(reference))].slice(0, 20);
}
