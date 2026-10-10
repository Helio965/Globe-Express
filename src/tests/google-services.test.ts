import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Location } from '../types/explorer';

vi.mock('../lib/upstream', () => ({ upstreamJson: vi.fn() }));

import { upstreamJson } from '../lib/upstream';
import { googleDetails, googleNearby, googlePhotoUrl, googleResolve, googleReverse, googleSearch } from '../services/google';

const upstream = vi.mocked(upstreamJson);
const token = '3e2b8a50-5d0f-4c07-9bd8-57e60448f4ac';
const placeId = 'ChIJtest_place-123';
const photoName = `places/${placeId}/photos/AF1Qphoto_123`;
const samplePlace = {
  id: placeId,
  displayName: { text: 'Jardim Botânico' },
  formattedAddress: 'Rua Jardim, Rio de Janeiro, Brasil',
  location: { latitude: -22.967, longitude: -43.224 },
  types: ['park', 'tourist_attraction'],
  addressComponents: [
    { longText: 'Brasil', shortText: 'BR', types: ['country'] },
    { longText: 'Rio de Janeiro', shortText: 'RJ', types: ['administrative_area_level_1'] },
  ],
  googleMapsUri: 'https://maps.google.com/?cid=123',
  attributions: [{ provider: '<b>Fornecedor local</b>', providerUri: 'https://example.org/credit' }],
  photos: [{
    name: photoName,
    widthPx: 2000,
    heightPx: 1200,
    authorAttributions: [{ displayName: '<b>Maria</b>', uri: 'https://maps.google.com/contrib/123' }],
  }],
};
const center: Location = {
  reference: { provider: 'google', id: placeId },
  name: 'Jardim Botânico', coordinates: { lat: -22.967, lng: -43.224 }, kind: 'park', attributions: ['Google Maps'],
};

beforeEach(() => {
  upstream.mockReset();
  vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'test-server-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('Google Places search and resolution', () => {
  it('sends Portuguese autocomplete with a shared session and explicit fields', async () => {
    upstream.mockResolvedValue({ suggestions: [
      { placePrediction: { placeId, structuredFormat: { mainText: { text: 'Jardim Botânico' }, secondaryText: { text: 'Rio de Janeiro, Brasil' } } } },
      { queryPrediction: { text: { text: 'ignored query suggestion' } } },
    ] });
    const suggestions = await googleSearch('  Jardim  ', token);
    expect(suggestions).toEqual([{ reference: { provider: 'google', id: placeId }, title: 'Jardim Botânico', subtitle: 'Rio de Janeiro, Brasil' }]);
    const [url, options] = upstream.mock.calls[0];
    expect(String(url)).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(options?.init?.cache).toBe('no-store');
    expect(options?.init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-server-key' });
    expect(JSON.parse(String(options?.init?.body))).toEqual({ input: 'Jardim', sessionToken: token, languageCode: 'pt-BR' });
  });

  it('fetches details once and produces attributed server photo references without a key', async () => {
    upstream.mockResolvedValue(samplePlace);
    const details = await googleDetails(placeId, token);
    expect(details.location).toMatchObject({ name: 'Jardim Botânico', country: 'Brasil', region: 'Rio de Janeiro', kind: 'park', coordinates: center.coordinates });
    expect(details.location.attributions).toEqual(['Google Maps', 'Fornecedor local — https://example.org/credit']);
    expect(details.photos[0]).toMatchObject({ author: 'Maria', provider: 'google', authorUrl: 'https://maps.google.com/contrib/123', licenseUrl: 'https://www.google.com/help/terms_maps/' });
    expect(details.photos[0].url).toBe(`/api/photos?name=${encodeURIComponent(photoName)}&width=1600`);
    expect(JSON.stringify(details)).not.toContain('test-server-key');
    expect(String(upstream.mock.calls[0][0])).toContain(`sessionToken=${token}`);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed coordinates and mismatched place IDs from upstream', async () => {
    upstream.mockResolvedValueOnce({ ...samplePlace, location: { latitude: 91, longitude: -43.224 } });
    await expect(googleDetails(placeId)).rejects.toMatchObject({ code: 'INVALID_GOOGLE_RESPONSE', status: 502 });
    upstream.mockResolvedValueOnce({ ...samplePlace, id: 'AnotherId' });
    await expect(googleDetails(placeId)).rejects.toMatchObject({ code: 'INVALID_GOOGLE_RESPONSE' });
  });

  it('fails before any network call when credentials or request references are missing', async () => {
    vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', '');
    await expect(googleSearch('Rio')).rejects.toMatchObject({ code: 'GOOGLE_NOT_CONFIGURED', status: 503 });
    await expect(googleDetails('../secret')).rejects.toMatchObject({ code: 'INVALID_PLACE_ID', status: 400 });
    await expect(googleSearch('Rio', 'not-a-uuid')).rejects.toMatchObject({ code: 'INVALID_SESSION_TOKEN', status: 400 });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('drops unsafe external URLs and renders author attribution as text', async () => {
    upstream.mockResolvedValue({
      ...samplePlace,
      googleMapsUri: 'javascript:alert(1)',
      photos: [{ ...samplePlace.photos[0], authorAttributions: [{ displayName: '<img src=x onerror=alert(1)>Maria', uri: 'javascript:alert(1)' }] }],
    });
    const details = await googleDetails(placeId);
    expect(details.location.sourceUrl).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    expect(details.photos[0].author).toBe('Maria');
    expect(details.photos[0].authorUrl).toBeUndefined();
    expect(details.photos[0].licenseUrl).toBe('https://www.google.com/help/terms_maps/');
    expect(JSON.stringify(details)).not.toContain('javascript:');
  });

  it('deduplicates references and prioritizes large landscape photos over small and portrait photos', async () => {
    const photo = samplePlace.photos[0];
    const landscape = { ...photo, name: `places/${placeId}/photos/Landscape`, widthPx: 2000, heightPx: 1200 };
    const portrait = { ...photo, name: `places/${placeId}/photos/Portrait`, widthPx: 1800, heightPx: 2400 };
    const tiny = { ...photo, name: `places/${placeId}/photos/Tiny`, widthPx: 200, heightPx: 120 };
    upstream.mockResolvedValue({ ...samplePlace, photos: [portrait, tiny, landscape, landscape] });
    const details = await googleDetails(placeId);
    expect(details.photos.map(item => item.id)).toEqual([landscape.name, portrait.name]);
  });

  it('keeps authentic small photos when no larger alternatives are returned', async () => {
    upstream.mockResolvedValue({ ...samplePlace, photos: [{ ...samplePlace.photos[0], widthPx: 320, heightPx: 200 }] });
    const details = await googleDetails(placeId);
    expect(details.photos[0]).toMatchObject({ width: 320, height: 200 });
  });

  it('preserves every supplied author attribution with only safe URLs', async () => {
    upstream.mockResolvedValue({ ...samplePlace, photos: [{ ...samplePlace.photos[0], authorAttributions: [
      { displayName: '<b>Maria</b>', uri: 'https://maps.google.com/contrib/maria' },
      { displayName: 'João', uri: 'https://maps.google.com/contrib/joao' },
      { displayName: 'Ana', uri: 'javascript:alert(1)' },
    ] }] });
    const details = await googleDetails(placeId);
    expect(details.photos[0].authorAttributions).toEqual([
      { name: 'Maria', url: 'https://maps.google.com/contrib/maria' },
      { name: 'João', url: 'https://maps.google.com/contrib/joao' },
      { name: 'Ana', url: undefined },
    ]);
    expect(details.photos[0].author).toBe('Maria, João, Ana');
  });
});

describe('Google reverse geocoding and nearby search', () => {
  it('preserves the clicked coordinates while using the real returned address', async () => {
    upstream.mockResolvedValue({ status: 'OK', results: [{
      place_id: placeId,
      formatted_address: 'Rio de Janeiro, Brasil',
      types: ['locality'],
      address_components: [
        { long_name: 'Rio de Janeiro', types: ['locality'] },
        { long_name: 'Brasil', short_name: 'BR', types: ['country'] },
      ],
      geometry: { location: { lat: -22, lng: -43 } },
    }] });
    const coordinates = { lat: -22.912345, lng: -43.198765 };
    const location = await googleResolve({ provider: 'coordinates', ...coordinates });
    expect(location.name).toBe('Rio de Janeiro');
    expect(location.coordinates).toEqual(coordinates);
    expect(location.reference).toEqual({ provider: 'coordinates', ...coordinates });
    expect(new URL(String(upstream.mock.calls[0][0])).searchParams.get('latlng')).toBe('-22.912345,-43.198765');
  });

  it('keeps ocean selections as coordinates when Google returns zero results', async () => {
    upstream.mockResolvedValue({ status: 'ZERO_RESULTS', results: [] });
    const coordinates = { lat: 0.01, lng: -140 };
    const location = await googleReverse(coordinates);
    expect(location).toMatchObject({ name: '0.0100°, -140.0000°', coordinates, kind: 'coordinates' });
    expect(location.country).toBeUndefined();
    expect(location.region).toBeUndefined();
  });

  it('exposes a retryable quota error instead of inventing a location', async () => {
    upstream.mockResolvedValue({ status: 'OVER_QUERY_LIMIT', results: [] });
    await expect(googleReverse({ lat: 0, lng: 0 })).rejects.toMatchObject({ code: 'GOOGLE_QUOTA', status: 429, retryAfter: 60 });
    await expect(googleReverse({ lat: Number.NaN, lng: 0 })).rejects.toMatchObject({ code: 'INVALID_COORDINATES', status: 400 });
  });

  it('uses supported nearby filters and excludes the selected place', async () => {
    upstream.mockResolvedValue({ places: [samplePlace, { ...samplePlace, id: 'ChIJnearby', displayName: { text: 'Parque real' }, location: { latitude: -22.96, longitude: -43.22 } }] });
    const places = await googleNearby(center);
    expect(places).toHaveLength(1);
    expect(places[0].location.reference).toEqual({ provider: 'google', id: 'ChIJnearby' });
    expect(places[0].distanceKm).toBeGreaterThan(0);
    const body = JSON.parse(String(upstream.mock.calls[0][1]?.init?.body));
    expect(body.includedTypes).toEqual(['tourist_attraction', 'museum', 'park']);
    expect(body.locationRestriction.circle).toEqual({ center: { latitude: -22.967, longitude: -43.224 }, radius: 15000 });
  });
});

describe('Google photo media', () => {
  it('obtains a real photo URI on demand through a server-key header', async () => {
    upstream.mockResolvedValue({ photoUri: 'https://lh3.googleusercontent.com/p/AF1Q-real-image' });
    expect(await googlePhotoUrl(photoName, 600)).toBe('https://lh3.googleusercontent.com/p/AF1Q-real-image');
    const [requestUrl, options] = upstream.mock.calls[0];
    const url = new URL(String(requestUrl));
    expect(url.pathname).toBe(`/v1/${photoName}/media`);
    expect(url.searchParams.get('maxWidthPx')).toBe('600');
    expect(url.searchParams.get('skipHttpRedirect')).toBe('true');
    expect(url.searchParams.has('key')).toBe(false);
    expect(options?.init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-server-key' });
  });

  it('rejects invalid photo references and redirects to untrusted hosts', async () => {
    await expect(googlePhotoUrl('places/../photos/test')).rejects.toMatchObject({ status: 400 });
    await expect(googlePhotoUrl(photoName, 10000)).rejects.toMatchObject({ status: 400 });
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue({ photoUri: 'https://attacker.example/image' });
    await expect(googlePhotoUrl(photoName)).rejects.toMatchObject({ code: 'INVALID_GOOGLE_RESPONSE', status: 502 });
  });
});
