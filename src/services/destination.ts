import type { Destination, Location, Photo, PlaceReference, ServiceWarning } from '@/types/explorer';
import { ApiError } from '@/lib/errors';
import { getExplorerConfig } from '@/lib/config';
import { googleDetails, googleNearby, googleReverse } from './google';
import { enrichOpenLocation, openResolve } from './open-provider';

export interface ResolvedDestination { location: Location; photos: Photo[]; warnings: ServiceWarning[] }
export async function resolveDestination(reference: PlaceReference, sessionToken?: string, signal?: AbortSignal): Promise<ResolvedDestination> {
  const config = getExplorerConfig();
  if (reference.provider === 'google') {
    if (!config.googleConfigured) throw new ApiError('GOOGLE_NOT_CONFIGURED', 'Este favorito usa o Google. Configure as chaves de mapa e pesquisa para abri-lo.', 503);
    const data = await googleDetails(reference.id, sessionToken, signal);
    return { location: data.location, photos: data.photos, warnings: [] };
  }
  if (reference.provider === 'coordinates' && config.googleConfigured) {
    return { location: await googleReverse(reference, signal), photos: [], warnings: [] };
  }
  return { location: await openResolve(reference, signal), photos: [], warnings: [] };
}
export async function completeDestination(resolved: ResolvedDestination, signal?: AbortSignal): Promise<Destination> {
  const { location } = resolved;
  const usesGoogle = location.reference.provider === 'google' || location.attributions.includes('Google Maps');
  const [contentResult, nearbyResult] = await Promise.allSettled([
    enrichOpenLocation(location, signal),
    usesGoogle ? googleNearby(location, signal) : Promise.resolve(null),
  ]);
  if (signal?.aborted) throw new ApiError('REQUEST_ABORTED', 'Consulta cancelada.', 499);
  const warnings = [...resolved.warnings];
  const content = contentResult.status === 'fulfilled' ? contentResult.value : {
    summary: '', sections: [], photos: [], nearby: [], facts: [],
    sources: location.sourceUrl ? [{ name: usesGoogle ? 'Google Maps' : 'Fonte geográfica', url: location.sourceUrl }] : [],
    warnings: [{ service: 'Wikimedia', message: 'As informações e fotografias abertas não puderam ser consultadas. Os dados geográficos continuam disponíveis.' }],
  };
  warnings.push(...content.warnings);
  if (nearbyResult.status === 'rejected') warnings.push({ service: 'Google Places', message: 'Não foi possível consultar atrações próximas no Google. Resultados de fontes abertas aparecem quando disponíveis.' });
  // Google content lives only in this response. No database, disk, Next cache,
  // or localStorage stores photo references, names, addresses, or descriptions.
  const photos = [...content.photos, ...resolved.photos].filter((photo, index, all) => all.findIndex(other => other.id === photo.id || other.url === photo.url) === index).slice(0, 12);
  if (photos.length) {
    const missingPhotos = warnings.findIndex(item => item.service === 'Fotografias');
    if (missingPhotos >= 0) warnings.splice(missingPhotos, 1);
  }
  const googleNearbyPlaces = nearbyResult.status === 'fulfilled' ? nearbyResult.value : null;
  const sources = [...content.sources];
  if (usesGoogle && location.sourceUrl && !sources.some(source => source.url === location.sourceUrl)) sources.push({ name: 'Google Maps', url: location.sourceUrl });
  return { location, ...content, photos, nearby: googleNearbyPlaces?.length ? googleNearbyPlaces : content.nearby, sources, warnings };
}
