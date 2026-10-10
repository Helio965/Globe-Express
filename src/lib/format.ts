import type { Coordinates, PlaceReference } from '@/types/explorer';
export function formatCoordinates({ lat, lng }: Coordinates): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lng).toFixed(4)}° ${lng < 0 ? 'O' : 'L'}`;
}
export function referenceKey(reference: PlaceReference): string {
  switch (reference.provider) {
    case 'google': return `google:${reference.id}`;
    case 'wikipedia': return `wikipedia:${reference.language}:${reference.id}`;
    case 'coordinates': return `coordinates:${reference.lat.toFixed(6)}:${reference.lng.toFixed(6)}`;
  }
}
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const radians = (n: number) => n * Math.PI / 180;
  const dlat = radians(b.lat - a.lat), dlng = radians(b.lng - a.lng);
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
