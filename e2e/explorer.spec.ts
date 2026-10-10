import { expect, test } from '@playwright/test';
import { alpha, alphaReference, beta, betaReference, deferred, destinationFixture, expectNoHorizontalOverflow, fulfillDestination, googleReference, installTestApi, openCinemaAlpha, openReadyApp, selectWithKeyboard, suggestions } from './fixtures';
import type { PlaceReference } from '../src/types/explorer';

test('complete exploration continues across map, cinema, photos, details and nearby destinations', async ({ page }) => {
  const state = await installTestApi(page);
  let documentNavigations = 0;
  page.on('request', request => { if (request.resourceType() === 'document') documentNavigations++; });
  await openReadyApp(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('O MUNDO');
  expect(state.destinations).toHaveLength(0);
  await page.getByRole('button', { name: 'Comece a explorar' }).click();
  const map = page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' });
  await expect(map).toBeVisible();
  await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible();
  await map.evaluate(element => element.setAttribute('data-test-instance', 'persistent-map'));
  await selectWithKeyboard(page);
  await expect(page.getByRole('complementary', { name: `Local selecionado: ${alpha.location.name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir experiência' }).click();
  await expect(page.locator('.photo-counter').locator('span').first()).toHaveText('01');
  await page.getByRole('button', { name: 'Próxima fotografia' }).click();
  await expect(page.locator('.photo-counter').locator('span').first()).toHaveText('02');
  await expect(page.locator('.hero-photo-credit')).toContainText('Autor de fixture 2');
  await page.getByRole('button', { name: 'Fotografia anterior' }).click();
  await expect(page.locator('.photo-counter').locator('span').first()).toHaveText('01');
  await page.getByRole('button', { name: 'Ver fotografia 3 de 3:', exact: false }).click();
  await expect(page.locator('.photo-counter').locator('span').first()).toHaveText('03');
  await page.getByRole('button', { name: 'Conheça este lugar' }).click();
  const dialog = page.getByRole('dialog', { name: alpha.location.name });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Seção documentada de teste')).toBeVisible();
  await expect(dialog.getByText('1.234 m')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Referência de teste' })).toHaveAttribute('href', 'https://example.test/source');
  await expect(dialog.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Ver no mapa' }).click();
  await expect(map).toHaveAttribute('data-test-instance', 'persistent-map');
  await page.getByRole('button', { name: 'Cinema', exact: true }).click();
  await page.getByRole('button', { name: /Destino Beta — fixture/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: beta.location.name })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: alpha.location.name })).toHaveCount(0);
  expect(state.destinations).toEqual([alphaReference, betaReference]);
  expect(documentNavigations).toBe(1);
});

test('details dialog traps keyboard focus and restores its trigger on close', async ({ page }) => {
  await installTestApi(page);
  await openReadyApp(page);
  await openCinemaAlpha(page);
  const trigger = page.getByRole('button', { name: 'Conheça este lugar' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: alpha.location.name });
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Fechar janela' })).toBeFocused();
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('favorites and history persist only validated references and re-fetch content when revisited', async ({ page }) => {
  const state = await installTestApi(page);
  await openReadyApp(page);
  await selectWithKeyboard(page, 'Google');
  await expect(page.getByRole('heading', { name: 'Conteúdo Google — fixture', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');
  const storage = await page.evaluate(() => ({ favorites: localStorage.getItem('world-explorer:favorites:v1'), recent: localStorage.getItem('world-explorer:recent:v1') }));
  expect(JSON.parse(storage.favorites!)).toEqual([googleReference]);
  expect(JSON.parse(storage.recent!)).toEqual([googleReference]);
  expect(JSON.stringify(storage)).not.toMatch(/Conteúdo Google|photos|summary|sourceUrl|address/);
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await page.getByRole('dialog').locator('.saved-place').first().click();
  await expect.poll(() => state.destinations.length).toBe(2);
  await expect(page.getByRole('heading', { name: 'Conteúdo Google — fixture', level: 1 })).toBeVisible();
  await selectWithKeyboard(page, 'Beta');
  await expect(page.getByRole('heading', { name: beta.location.name, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await page.getByRole('button', { name: /Recentes/ }).click();
  await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(2);
  await page.getByRole('dialog').locator('.saved-place').nth(1).click();
  await expect(page.getByRole('heading', { name: 'Conteúdo Google — fixture', level: 1 })).toBeVisible();
  expect(state.destinations.at(-1)).toEqual(googleReference);
  await page.reload();
  await expect(page.getByRole('combobox')).toBeEnabled();
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(1);
  await page.getByRole('button', { name: /Recentes/ }).click();
  await page.getByRole('button', { name: 'Limpar histórico' }).click();
  await expect(page.getByText('O primeiro passo ainda está por vir.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('world-explorer:recent:v1'))).toBe('[]');
});

test('malformed local storage does not break exploration', async ({ page }) => {
  await installTestApi(page);
  await page.addInitScript(() => {
    localStorage.setItem('world-explorer:favorites:v1', '[invalid JSON');
    localStorage.setItem('world-explorer:recent:v1', '{"provider":"untrusted"}');
  });
  await openReadyApp(page);
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await expect(page.getByText('Sua coleção começa com um lugar.')).toBeVisible();
  await page.keyboard.press('Escape');
  await openCinemaAlpha(page);
  await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('world-explorer:favorites:v1')!))).toEqual([alphaReference]);
});

test('an absent search result and API quota failure allow another keyboard search', async ({ page }) => {
  await installTestApi(page);
  await page.route('**/api/search?*', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    return query === 'Unknown' ? route.fulfill({ json: { data: [] } })
      : query === 'Quota' ? route.fulfill({ status: 429, json: { error: { code: 'UPSTREAM_QUOTA', message: 'Cota atingida na fonte de teste. Aguarde antes de tentar.', retryAfter: 60 } } })
      : route.fulfill({ json: { data: suggestions(query || '') } });
  });
  await openReadyApp(page);
  const input = page.getByRole('combobox');
  await input.fill('Unknown');
  await expect(page.getByText('Nenhum lugar encontrado. Tente outro nome ou país.')).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(0);
  await input.fill('Quota');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Cota atingida na fonte de teste.');
  await expect(page.getByRole('button', { name: 'Aguarde um instante' })).toBeDisabled();
  await page.getByRole('button', { name: 'Limpar busca' }).click();
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await openCinemaAlpha(page);
});

test('typing below the minimum length never requests data and similar names retain geographic context', async ({ page }) => {
  const state = await installTestApi(page);
  await openReadyApp(page);
  const input = page.getByRole('combobox');
  await input.fill('A');
  await expect(page.getByText('Digite pelo menos 2 caracteres para buscar.')).toBeVisible();
  expect(state.searches).toHaveLength(0);
  await input.fill('Alpha');
  await expect(page.getByRole('option')).toHaveCount(2);
  await expect(page.getByRole('option').first()).toContainText('Região A, País de teste');
  await expect(page.getByRole('option').last()).toContainText('Região B, Outro país de teste');
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(page.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: beta.location.name, level: 1 })).toBeVisible();
  expect(state.destinations).toEqual([betaReference]);
});

test('storage quota failure shows a notice while destination exploration remains usable', async ({ page }) => {
  await installTestApi(page);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Test quota exhausted', 'QuotaExceededError'); };
  });
  await openReadyApp(page);
  await openCinemaAlpha(page);
  await expect(page.locator('.notice-toast')).toContainText('O navegador não permitiu salvar este lugar.');
  await expect(page.locator('.error-scene')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
  await expect(page.locator('.notice-toast')).toBeVisible();
  await expect(page.getByRole('heading', { name: alpha.location.name, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Conheça este lugar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('failed map tiles can be reloaded while map selection stays available', async ({ page }) => {
  await installTestApi(page);
  let failTiles = true;
  let tileRequests = 0;
  await page.route('https://tile.openstreetmap.org/**', route => {
    tileRequests++;
    return failTiles ? route.abort() : route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  });
  await openReadyApp(page);
  await page.getByRole('button', { name: 'Comece a explorar' }).click();
  await expect(page.locator('.map-tile-warning')).toContainText('Algumas áreas do mapa não carregaram.');
  const beforeRetry = tileRequests;
  failTiles = false;
  await page.getByRole('button', { name: 'Tentar carregar os blocos do mapa novamente' }).click();
  await expect.poll(() => tileRequests).toBeGreaterThan(beforeRetry);
  await expect(page.locator('.map-tile-warning')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' })).toBeVisible();
  await expect(page.getByText('Satélite e relevo disponíveis com Google Maps.')).toBeVisible();
});

test('slow destination requests show progress and an external failure can be retried', async ({ page }) => {
  await installTestApi(page);
  const first = deferred();
  const started = deferred();
  let calls = 0;
  await page.route('**/api/destination', async route => {
    calls++;
    if (calls === 1) {
      started.resolve();
      await first.promise;
      await route.fulfill({ status: 502, json: { error: { code: 'UPSTREAM_FAILED', message: 'Fonte de teste indisponível.' } } });
    } else await fulfillDestination(route, alpha);
  });
  await openReadyApp(page);
  await selectWithKeyboard(page);
  await started.promise;
  await expect(page.getByRole('heading', { name: 'Encontrando o seu lugar.' })).toBeVisible();
  await expect(page.locator('.loading-scene')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('combobox')).toBeEnabled();
  first.resolve();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Fonte de teste indisponível.');
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: alpha.location.name })).toBeVisible();
  expect(calls).toBe(2);
});

test('searching for another place clears a failed destination and restores map interaction', async ({ page }) => {
  await installTestApi(page);
  let calls = 0;
  await page.route('**/api/destination', route => ++calls === 1
    ? route.fulfill({ status: 502, json: { error: { code: 'UPSTREAM_FAILED', message: 'Destino de teste indisponível.' } } })
    : fulfillDestination(route, beta));
  await openReadyApp(page);
  await selectWithKeyboard(page, 'Alpha');
  await expect(page.locator('.error-scene')).toContainText('Destino de teste indisponível.');
  await page.getByRole('button', { name: 'Buscar outro lugar' }).click();
  await expect(page.locator('.error-scene')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' })).toBeVisible();
  await expect(page.getByRole('combobox')).toBeFocused();
  await selectWithKeyboard(page, 'Beta');
  await expect(page.getByRole('complementary', { name: `Local selecionado: ${beta.location.name}` })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir experiência' }).click();
  await expect(page.getByRole('heading', { name: beta.location.name, level: 1 })).toBeVisible();
});

test('late destination A cannot overwrite newer destination B', async ({ page }) => {
  await installTestApi(page);
  const releaseAlpha = deferred();
  const alphaStarted = deferred();
  const canceled: string[] = [];
  page.on('requestfailed', request => { if (request.url().includes('/api/destination')) canceled.push(request.failure()?.errorText || 'failed'); });
  await page.route('**/api/destination', async route => {
    const { reference } = route.request().postDataJSON() as { reference: PlaceReference };
    if (reference.provider === 'wikipedia' && reference.id === '101') {
      alphaStarted.resolve();
      await releaseAlpha.promise;
      await fulfillDestination(route, alpha).catch(() => undefined);
    } else await fulfillDestination(route, beta);
  });
  await openReadyApp(page);
  await selectWithKeyboard(page, 'Alpha');
  await alphaStarted.promise;
  await selectWithKeyboard(page, 'Beta');
  await expect(page.getByRole('heading', { name: beta.location.name, level: 1 })).toBeVisible();
  releaseAlpha.resolve();
  await expect.poll(() => canceled.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: alpha.location.name, level: 1 })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('world-explorer:recent:v1')!))).toEqual([betaReference]);
});

test('late search results are invalidated when the query changes', async ({ page }) => {
  await installTestApi(page);
  const oldSearchStarted = deferred();
  const releaseOld = deferred();
  await page.route('**/api/search?*', async route => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    if (query === 'Alpha') {
      oldSearchStarted.resolve();
      await releaseOld.promise;
      await route.fulfill({ json: { data: suggestions('Alpha') } }).catch(() => undefined);
    } else await route.fulfill({ json: { data: suggestions('Beta') } });
  });
  await openReadyApp(page);
  const input = page.getByRole('combobox');
  await input.fill('Alpha');
  await oldSearchStarted.promise;
  await input.fill('Beta');
  await expect(page.getByRole('option', { name: /Destino Beta/ })).toBeVisible();
  releaseOld.resolve();
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option', { name: /Destino Alpha/ })).toHaveCount(0);
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue('Beta');
});

test('remote ocean coordinates remain intact without invented photographs or facts', async ({ page }) => {
  const state = await installTestApi(page);
  await openReadyApp(page);
  await page.getByRole('button', { name: 'Comece a explorar' }).click();
  const map = page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' });
  await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible();
  await map.click({ position: { x: 1000, y: 370 } });
  await expect(page.getByRole('heading', { level: 1, name: 'Ponto de teste no oceano' })).toBeVisible();
  const reference = state.destinations[0];
  expect(reference.provider).toBe('coordinates');
  if (reference.provider !== 'coordinates') throw new Error('Map click must preserve coordinates');
  expect(Number.isFinite(reference.lat)).toBe(true);
  expect(reference.lat).toBeGreaterThanOrEqual(-90);
  expect(reference.lat).toBeLessThanOrEqual(90);
  expect(reference.lng).toBeGreaterThanOrEqual(-180);
  expect(reference.lng).toBeLessThanOrEqual(180);
  await page.getByRole('button', { name: 'Abrir experiência' }).click();
  await expect(page.getByText('VISUALIZAÇÃO GEOGRÁFICA · FOTOGRAFIAS NÃO DISPONÍVEIS')).toBeVisible();
  await expect(page.locator('.cinematic-hero img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Próxima fotografia' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Conheça este lugar' }).click();
  await expect(page.getByRole('dialog')).toContainText(`${reference.lat.toFixed(5)}°, ${reference.lng.toFixed(5)}°`);
  await expect(page.getByRole('dialog')).toContainText('Não há informações suficientes');
  await expect(page.getByRole('dialog').locator('.fact')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ver no mapa' }).click();
  await expect(map).toBeVisible();
});

test('an image load failure preserves the destination and displays an explicit fallback', async ({ page }) => {
  await installTestApi(page);
  await page.route('**/__test_images__/photo-1.svg', route => route.abort());
  await openReadyApp(page);
  await openCinemaAlpha(page);
  await expect(page.locator('.hero-photograph')).toContainText('Fotografia indisponível');
  await expect(page.getByRole('heading', { name: alpha.location.name, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima fotografia' }).click();
  await expect(page.locator('.hero-photograph img')).toHaveAttribute('alt', 'Imagem desenhada de teste 2');
  await expect.poll(() => page.locator('.hero-photograph img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('partial content and service warnings expose only available information', async ({ page }) => {
  await installTestApi(page);
  const sparse = { ...destinationFixture(alphaReference, 'Destino com poucos dados — fixture'), summary: '', photos: [], nearby: [], sections: [], facts: [], sources: [], warnings: [{ service: 'Wikipedia', message: 'A fonte de teste está indisponível. Dados geográficos preservados.' }] };
  await page.route('**/api/destination', route => fulfillDestination(route, sparse));
  await openReadyApp(page);
  await selectWithKeyboard(page);
  await expect(page.getByRole('heading', { name: sparse.location.name, level: 1 })).toBeVisible();
  await expect(page.getByText('Algumas informações não estão disponíveis.')).toBeVisible();
  await page.getByRole('button', { name: 'Conheça este lugar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('ainda não encontramos um resumo confiável');
  await expect(dialog).toContainText('Dados geográficos preservados.');
  await expect(dialog.locator('.fact')).toHaveCount(0);
  await expect(dialog.locator('.content-section')).toHaveCount(0);
});

test('configuration failure offers a working retry without enabling premature requests', async ({ page }) => {
  await installTestApi(page);
  let attempts = 0;
  await page.route('**/api/config', route => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: { code: 'CONFIG_UNAVAILABLE', message: 'Configuração temporariamente indisponível no teste.' } } })
    : route.fulfill({ json: { data: { mapProvider: 'open', googleConfigured: false, googleBrowserKeyPresent: false, googleServerKeyPresent: false } } }));
  await page.goto('/');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Não foi possível preparar a exploração.');
  await expect(page.getByRole('combobox')).toBeDisabled();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('combobox')).toBeEnabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await openCinemaAlpha(page);
});

test.describe('touch devices', () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
    test(`responsive touch and keyboard exploration at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installTestApi(page);
      await openReadyApp(page);
      await expectNoHorizontalOverflow(page);
      await openCinemaAlpha(page);
      await expectNoHorizontalOverflow(page);
      await page.getByRole('button', { name: 'Próxima fotografia' }).tap();
      await expect(page.locator('.photo-counter').locator('span').first()).toHaveText('02');
      await page.getByRole('button', { name: 'Salvar nos favoritos' }).tap();
      await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toBeVisible();
      await page.getByRole('button', { name: 'Conheça este lugar' }).tap();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('group', { name: 'Modo de exploração' }).getByRole('button', { name: 'Mapa', exact: true }).tap();
      await expect(page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.getByRole('button', { name: 'Cinema', exact: true }).tap();
      await selectWithKeyboard(page, 'Beta');
      await expect(page.getByRole('heading', { name: beta.location.name, level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test('orientation changes and reduced-motion preference preserve usable controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installTestApi(page);
  await openReadyApp(page);
  await openCinemaAlpha(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('.destination-name')).toHaveCSS('opacity', '1');
  await page.setViewportSize({ width: 844, height: 390 });
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole('button', { name: 'Conheça este lugar' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver no mapa' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('region', { name: 'Mapa interativo do OpenStreetMap' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
