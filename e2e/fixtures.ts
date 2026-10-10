import { expect, type Page, type Route } from '@playwright/test';
import type { Destination, Photo, PlaceReference, SearchSuggestion } from '../src/types/explorer';

// These fixtures and drawn images exist exclusively inside the test runner.
// Runtime search, destinations, media and map providers never import this file.
export const alphaReference: PlaceReference = { provider: 'wikipedia', id: '101', language: 'pt' };
export const betaReference: PlaceReference = { provider: 'wikipedia', id: '202', language: 'pt' };
export const googleReference: PlaceReference = { provider: 'google', id: 'ChIJtest_only_303' };

function testPhoto(index: number): Photo {
  return {
    id: `test-only-photo-${index}`,
    url: `/__test_images__/photo-${index}.svg`, thumbnailUrl: `/__test_images__/photo-${index}.svg`,
    width: 1800, height: 1100, alt: `Imagem desenhada de teste ${index}`,
    author: `Autor de fixture ${index}`, license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: `https://example.test/test-image/${index}`, provider: 'commons',
  };
}

export function destinationFixture(reference: PlaceReference, name = 'Destino Alpha — fixture'): Destination {
  const coordinates = reference.provider === 'coordinates' ? { lat: reference.lat, lng: reference.lng } : { lat: -15.793, lng: -47.883 };
  return {
    location: { reference, name, coordinates, country: 'País de teste', region: 'Região de teste', kind: 'fixture', sourceUrl: 'https://example.test/geographic-source', attributions: ['Fonte de teste'] },
    summary: 'Descrição usada apenas em testes automatizados. Não é conteúdo geográfico real.',
    sections: [{ title: 'Seção documentada de teste', text: 'Conteúdo completo para validar o painel de informações.' }],
    photos: [testPhoto(1), testPhoto(2), testPhoto(3)],
    nearby: [{ location: { reference: betaReference, name: 'Destino Beta — fixture', coordinates: { lat: -15.78, lng: -47.88 }, kind: 'fixture', country: 'País de teste', attributions: [] }, photo: testPhoto(2), distanceKm: 1.8 }],
    facts: [{ label: 'Fato de teste', value: '1.234 m', sourceUrl: 'https://example.test/fact' }],
    sources: [{ name: 'Referência de teste', url: 'https://example.test/source' }], warnings: [],
  };
}
export const alpha = destinationFixture(alphaReference);
export const beta = { ...destinationFixture(betaReference, 'Destino Beta — fixture'), nearby: [] };
export const google = destinationFixture(googleReference, 'Conteúdo Google — fixture');

export function suggestions(query: string): SearchSuggestion[] {
  if (query.toLowerCase().includes('beta')) return [{ reference: betaReference, title: beta.location.name, subtitle: 'Região B, País de teste' }];
  if (query.toLowerCase().includes('google')) return [{ reference: googleReference, title: google.location.name, subtitle: 'Região Google, País de teste' }];
  return [
    { reference: alphaReference, title: alpha.location.name, subtitle: 'Região A, País de teste' },
    { reference: betaReference, title: beta.location.name, subtitle: 'Região B, Outro país de teste' },
  ];
}

export async function fulfillDestination(route: Route, value: Destination) {
  await route.fulfill({
    status: 200, contentType: 'application/x-ndjson',
    body: `${JSON.stringify({ type: 'location', location: value.location })}\n${JSON.stringify({ type: 'destination', data: value })}\n`,
  });
}

export async function installTestApi(page: Page) {
  const state = { destinations: [] as PlaceReference[], searches: [] as string[] };
  await page.route('**/api/config', route => route.fulfill({ json: { data: { mapProvider: 'open', googleConfigured: false, googleBrowserKeyPresent: false, googleServerKeyPresent: false } } }));
  await page.route('**/api/search?*', route => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    state.searches.push(query);
    return route.fulfill({ json: { data: suggestions(query) } });
  });
  await page.route('**/api/destination', route => {
    const { reference } = route.request().postDataJSON() as { reference: PlaceReference };
    state.destinations.push(reference);
    const value = reference.provider === 'coordinates'
      ? { ...destinationFixture(reference, 'Ponto de teste no oceano'), photos: [], nearby: [], summary: 'Somente coordenadas verificadas de teste; nenhuma atração identificada.', sections: [], facts: [], sources: [], warnings: [{ service: 'Wikipedia', message: 'Não há informações suficientes para este ponto de teste.' }] }
      : reference.provider === 'google' ? google : reference.id === '202' ? beta : alpha;
    return fulfillDestination(route, value);
  });
  await page.route('**/__test_images__/**', route => {
    const color = route.request().url().includes('2.svg') ? '#275e69' : route.request().url().includes('3.svg') ? '#656451' : '#a36249';
    return route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1100" viewBox="0 0 1800 1100"><rect width="1800" height="1100" fill="${color}"/><path d="M0 950L450 300L700 800L1200 250L1800 950V1100H0Z" fill="#182c31"/><text x="60" y="80" fill="white" font-size="28">FIXTURE SOMENTE TESTE</text></svg>` });
  });
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.route('https://maps.gstatic.com/**', route => route.abort());
  return state;
}

export async function openReadyApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Buscar lugares pelo mundo' })).toBeEnabled();
}
export async function selectWithKeyboard(page: Page, query = 'Alpha') {
  const input = page.getByRole('combobox', { name: 'Buscar lugares pelo mundo' });
  await input.fill(query);
  await expect(page.getByRole('option').first()).toBeVisible();
  await input.press('ArrowDown');
  await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
}
export async function openCinemaAlpha(page: Page) {
  await selectWithKeyboard(page);
  await expect(page.getByRole('heading', { level: 1, name: alpha.location.name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conheça este lugar' })).toBeVisible();
}
export async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
