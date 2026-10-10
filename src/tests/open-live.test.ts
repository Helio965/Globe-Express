import { describe, expect, it } from 'vitest';
import { EnvHttpProxyAgent, fetch } from 'undici';
import { enrichOpenLocation, openResolve, openReverse, openSearch } from '@/services/open-provider';

// Network access is opt-in; ordinary tests stay deterministic and never impersonate live integrations.
describe.skipIf(process.env.WORLD_EXPLORER_LIVE_TESTS !== '1')('fontes públicas reais', () => {
  for (const [query, expected] of [['Brasília', /^brasília$/i], ['Pirâmides de Gizé', /giz[eé]|giza/i], ['Monte Everest', /everest/i], ['Yosemite National Park', /yosemite/i], ['Praia de Copacabana', /^praia de copacabana$/i], ['Tóquio', /^(?:t[oó]quio|tokyo)$/i]] as const) {
    it(`pesquisa e resolve ${query}`, async () => {
      const results = await openSearch(query);
      expect(results.length).toBeGreaterThan(0);
      const location = await openResolve(results[0].reference);
      expect(location.name).toMatch(expected);
      expect(Number.isFinite(location.coordinates.lat)).toBe(true);
      expect(Number.isFinite(location.coordinates.lng)).toBe(true);
      expect(location.sourceUrl).toMatch(/^https:\/\/(?:pt|en)\.wikipedia\.org\//);
      console.info(JSON.stringify({ query, resolved: location.name, coordinates: location.coordinates, source: location.sourceUrl }));
    }, 60000);
  }
  it('obtém resumo, facts e fotos licenciadas para entidade pesquisada', async () => {
    const results = await openSearch('Brasília');
    const location = await openResolve(results[0].reference);
    const destination = await enrichOpenLocation(location);
    console.info(JSON.stringify({ resolved: location.name, summaryLength: destination.summary.length, facts: destination.facts, photos: destination.photos.map((photo) => ({ id: photo.id, source: photo.sourceUrl, license: photo.license })), nearby: destination.nearby.map((place) => ({ name: place.location.name, distanceKm: place.distanceKm, hasPhoto: Boolean(place.photo) })), warnings: destination.warnings }));
    expect(destination.summary.length).toBeGreaterThan(50);
    expect(destination.facts.length).toBeGreaterThan(2);
    expect(destination.photos.length).toBeGreaterThan(0);
    expect(destination.photos.every((photo) => photo.author && photo.license && photo.sourceUrl.startsWith('https://commons.wikimedia.org/'))).toBe(true);
    const dispatcher = new EnvHttpProxyAgent();
    try {
      const urls = [destination.photos[0].url, destination.photos[0].thumbnailUrl];
      const imageResponses = await Promise.all(urls.map((url) => fetch(url, { method: 'HEAD', dispatcher, signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'WorldExplorer/1.0 (https://github.com/Helio965/Globe-Express)' } })));
      for (const response of imageResponses) { expect(response.status).toBe(200); expect(response.headers.get('content-type')).toMatch(/^image\//); }
      console.info(JSON.stringify({ verifiedImages: imageResponses.map((response, index) => ({ url: urls[index], status: response.status, bytes: response.headers.get('content-length') })) }));
    } finally { await dispatcher.close(); }
  }, 90000);
  it('preserva ponto oceânico e retorna pesquisa inexistente vazia', async () => {
    const coordinates = { lat: 0, lng: -140 };
    const location = await openReverse(coordinates);
    expect(location.coordinates).toEqual(coordinates);
    expect(location.reference.provider).toBe('coordinates');
    expect(location.name).toBe('Ponto no mapa');
    const destination = await enrichOpenLocation(location);
    expect(destination.photos).toEqual([]);
    expect(destination.nearby).toEqual([]);
    expect(await openSearch('zzzxxyyzznonexistentgeographicplaceqwerty')).toEqual([]);
    console.info(JSON.stringify({ ocean: location, warnings: destination.warnings }));
  }, 60000);
});
