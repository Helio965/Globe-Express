#!/usr/bin/env node
/**
 * Real documentation capture, separate from the fixture-backed end-to-end tests.
 * Run against an existing application; this script never replaces API responses.
 *
 * node scripts/capture-documentation.mjs screenshots
 * node scripts/capture-documentation.mjs record
 * WORLD_EXPLORER_URL=http://127.0.0.1:3001
 * WORLD_EXPLORER_DESTINATION=Brasília (a search input, not an application catalogue)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
assert(['screenshots', 'record'].includes(mode), 'Choose screenshots or record.');
const baseURL = process.env.WORLD_EXPLORER_URL || 'http://127.0.0.1:3000';
const query = process.env.WORLD_EXPLORER_DESTINATION || 'Brasília';
const mediaDirectory = path.join(repository, 'docs/media');
const screenshotsDirectory = path.join(mediaDirectory, 'screenshots');
const rawDirectory = process.env.WORLD_EXPLORER_RECORDING_DIRECTORY || path.join(tmpdir(), 'world-explorer-media', 'raw');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const gitSHA = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
const desktop = { width: 1920, height: 1080 };
const videoViewport = { width: 1920, height: 960 };
const mobile = { width: 430, height: 932 };
const issues = [];
const network = [];
const destinations = new Map();
const captures = [];
const timeline = [];
const pendingObservations = new Set();
const destinationBodies = new WeakMap();
const metadataQueries = [];
let clockStart;

await mkdir(screenshotsDirectory, { recursive: true });
await mkdir(rawDirectory, { recursive: true });
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true });

function seconds() { return Number(((performance.now() - clockStart) / 1000).toFixed(3)); }
function observe(page) {
  page.on('pageerror', error => issues.push({ type: 'javascript', message: error.message }));
  page.on('requestfailed', request => {
    const message = request.failure()?.errorText || 'Request failed';
    if (message.includes('ERR_ABORTED')) return; // A superseded search is intentionally canceled by the app.
    const url = new URL(request.url());
    issues.push({ type: 'network', host: url.hostname, path: url.pathname, message });
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (['tile.openstreetmap.org', 'upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)) {
      network.push({ host: url.hostname, status: response.status(), contentType: response.headers()['content-type'] || '' });
    }
    if (url.pathname !== '/api/destination' || response.request().method() !== 'POST') return;
    const observation = destinationFromResponse(response).then(data => {
      assert(data.photos.every(photo => photo.provider === 'commons'), 'Documentation must use the open provider, without Google content.');
      destinations.set(JSON.stringify(data.location.reference), data);
    }).catch(error => issues.push({ type: 'destination', message: error.message })).finally(() => pendingObservations.delete(observation));
    pendingObservations.add(observation);
  });
}

function destinationFromResponse(response) {
  if (!destinationBodies.has(response)) destinationBodies.set(response, readDestination(response));
  return destinationBodies.get(response);
}

async function readDestination(response) {
  assert.equal(response.status(), 200, `Destination HTTP ${response.status()}`);
  // Chromium/CDP sometimes loses an already consumed streamed body. Obtain provenance through
  // an additional real JSON query, without intercepting or replacing the UI's NDJSON response.
  // Name and every captured photograph are checked against the independently rendered interface.
  const input = response.request().postDataJSON();
  const metadataResponse = await response.frame().page().request.post(response.url(), {
    data: input, headers: { Accept: 'application/json' }, timeout: 30_000,
  });
  assert.equal(metadataResponse.status(), 200, 'The separate real metadata query must succeed.');
  metadataQueries.push({ reference: input.reference, source: 'Separate real POST /api/destination with Accept: application/json; application response was not intercepted or replaced.', reason: 'Chromium/CDP consumed-stream response-body limitation. UI rendering, destination name and photographed image URLs are verified separately.' });
  const destination = (await metadataResponse.json()).data;
  assert(destination?.location && Array.isArray(destination.photos), 'The real metadata response was incomplete.');
  return destination;
}

async function ready(page) {
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
  observe(page);
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('combobox')).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const response = await page.request.get(`${baseURL}/api/config`);
  assert.equal(response.status(), 200, 'The real configuration endpoint must succeed.');
  assert.equal((await response.json()).data.mapProvider, 'open', 'This documentation records the real Leaflet/OpenStreetMap mode.');
  await animationComplete(page, '[data-intro]');
  await healthy(page);
}

async function healthy(page) {
  await expect(page.locator('.error-scene, .configuration-alert')).toHaveCount(0);
  assert(!issues.some(issue => issue.type === 'javascript'), 'The page reported a JavaScript error.');
}

async function animationComplete(page, selector) {
  await page.waitForFunction(target => [...document.querySelectorAll(target)].every(element => {
    const style = getComputedStyle(element);
    return Number(style.opacity) >= 0.999 && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
  }), selector);
}

async function visibleImagesLoaded(page, selector = 'img') {
  await page.waitForFunction(target => [...document.querySelectorAll(target)].filter(image => {
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }).every(image => image.complete && image.naturalWidth > 0), selector);
  await expect(page.locator('.photo-unavailable')).toHaveCount(0);
}

async function waitForMap(page) {
  await expect(page.getByRole('region', { name: /^Mapa interativo do OpenStreetMap/ })).toBeVisible();
  await expect(page.locator('.leaflet-control-zoom-in')).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution a[href*="openstreetmap.org/copyright"]')).toBeVisible();
  await expect(page.locator('.map-status, .map-tile-warning')).toHaveCount(0);
  await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
  await page.evaluate(() => new Promise(resolve => {
    const pane = document.querySelector('.leaflet-map-pane');
    let previousTransform;
    let stableFrames = 0;
    function nextFrame() {
      const transform = getComputedStyle(pane).transform;
      stableFrames = transform === previousTransform ? stableFrames + 1 : 0;
      previousTransform = transform;
      if (stableFrames >= 12) resolve();
      else requestAnimationFrame(nextFrame);
    }
    requestAnimationFrame(nextFrame);
  }));
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
  await visibleImagesLoaded(page, '.leaflet-tile');
  await healthy(page);
}

async function nearbyImagesLoaded(page) {
  // A section screenshot includes cards outside the viewport. Load each through real scrolling.
  for (const image of await page.locator('#nearby-places .nearby-card img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole('heading', { name: 'Logo ali, outro mundo.' }).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('#nearby-places img')].every(image => image.complete && image.naturalWidth > 0));
}

async function search(page, typed = false) {
  const input = page.getByRole('combobox', { name: 'Buscar lugares pelo mundo' });
  await input.fill('');
  if (typed) await input.pressSequentially(query, { delay: 130 });
  else await input.fill(query);
  const results = page.getByRole('listbox', { name: 'Lugares encontrados' });
  await expect(results).toBeVisible();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(page.locator('.search-message-error')).toHaveCount(0);
  return input;
}

async function selectResult(page, input) {
  const suggestion = await page.getByRole('option').first().innerText();
  const request = page.waitForResponse(response => new URL(response.url()).pathname === '/api/destination' && response.request().method() === 'POST');
  await input.press('ArrowDown');
  await input.press('Enter');
  const data = await destinationFromResponse(await request);
  assert(data.photos.length >= 3, 'Choose a live destination with at least three licensed photographs.');
  assert(data.summary && data.facts.length > 0, 'The selected destination must have actual documented information.');
  await expect(page.getByRole('heading', { level: 1, name: data.location.name, exact: true })).toBeVisible();
  await healthy(page);
  return { data, suggestion };
}

async function cinemaReady(page, name) {
  await expect(page.locator('.cinematic-hero')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  await expect(page.locator('.hero-photograph img')).toBeVisible();
  await visibleImagesLoaded(page);
  await animationComplete(page, '[data-reveal]');
  await healthy(page);
}

async function screenshot(page, filename, label, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await visibleImagesLoaded(page);
  await healthy(page);
  const output = path.join(screenshotsDirectory, filename);
  if (options.locator) await page.locator(options.locator).screenshot({ path: output });
  else await page.screenshot({ path: output, fullPage: options.fullPage || false });
  const bytes = await readFile(output);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', 'Capture must be a valid PNG.');
  const imageScope = options.locator ? page.locator(options.locator).locator('img') : page.locator('img');
  const visibleImages = await imageScope.evaluateAll((images, entireScope) => images.filter(image => {
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0 && (entireScope || (rect.bottom > 0 && rect.top < innerHeight));
  }).map(image => ({ url: image.currentSrc, alt: image.alt, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })), Boolean(options.locator));
  const photoIds = [...destinations.values()].flatMap(data => [...data.photos, ...data.nearby.flatMap(place => place.photo ? [place.photo] : [])]).filter(photo => visibleImages.some(image => image.url === photo.url || image.url === photo.thumbnailUrl)).map(photo => photo.id);
  const photographicImages = visibleImages.filter(image => new URL(image.url).hostname.endsWith('wikimedia.org'));
  assert(photographicImages.every(image => [...destinations.values()].some(data => [...data.photos, ...data.nearby.flatMap(place => place.photo ? [place.photo] : [])].some(photo => image.url === photo.url || image.url === photo.thumbnailUrl))), 'Every captured Wikimedia photograph must match actual metadata from the real API.');
  captures.push({ file: `docs/media/screenshots/${filename}`, label, viewport: page.viewportSize(), dimensions: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, bytes: bytes.length, photoIds: [...new Set(photoIds)], visibleImages, credits: await page.locator('.photo-credit:visible').allTextContents() });
  console.log(`Captured ${filename} (${bytes.readUInt32BE(16)} × ${bytes.readUInt32BE(20)})`);
}

async function captureScreenshots() {
  const context = await browser.newContext({ viewport: desktop, deviceScaleFactor: 1, locale: 'pt-BR', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await ready(page);
  await screenshot(page, '01-home.png', 'Tela inicial');
  await page.getByRole('button', { name: 'Comece a explorar' }).click();
  await waitForMap(page);
  const input = await search(page);
  await screenshot(page, '02-search.png', 'Pesquisa real de localidades');
  const { data, suggestion } = await selectResult(page, input);
  await waitForMap(page);
  await visibleImagesLoaded(page);
  await screenshot(page, '03-map.png', `Mapa OpenStreetMap com ${data.location.name}`);
  await page.getByRole('button', { name: 'Abrir experiência' }).click();
  await cinemaReady(page, data.location.name);
  await screenshot(page, '04-cinematic.png', `Experiência cinematográfica: ${data.location.name}`);
  await page.getByRole('button', { name: 'Conheça este lugar' }).click();
  const dialog = page.getByRole('dialog', { name: data.location.name, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.facts-grid')).toBeVisible();
  await screenshot(page, '05-details.png', `Informações documentadas de ${data.location.name}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Próxima fotografia' }).click();
  await expect(page.locator('.photo-counter > span').first()).toHaveText('02');
  await cinemaReady(page, data.location.name);
  if (data.nearby.length) {
    await page.getByRole('button', { name: 'Continue a descoberta' }).click();
    await expect(page.getByRole('heading', { name: 'Logo ali, outro mundo.' })).toBeVisible();
    await nearbyImagesLoaded(page);
    await screenshot(page, '06-gallery.png', 'Fotografias e locais próximos reais', { locator: '#nearby-places' });
  } else {
    await screenshot(page, '06-gallery.png', 'Galeria de fotografias reais');
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  console.log('Checking favorite save and real reference re-open.');
  await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
  await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(1);
  const reFetch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/destination' && response.request().method() === 'POST');
  await page.getByRole('dialog').locator('.saved-place').first().click();
  await destinationFromResponse(await reFetch);
  await cinemaReady(page, data.location.name);
  console.log('Saved reference re-opened with real content.');
  await page.getByRole('button', { name: 'Seus lugares' }).click();
  await page.getByRole('button', { name: /^Recentes/ }).click();
  await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(1);
  await screenshot(page, '07-favorites.png', 'Favoritos e histórico, com recuperação real de uma referência');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: mobile, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'no-preference' });
  const mobilePage = await mobileContext.newPage();
  await ready(mobilePage);
  const mobileSelection = await selectResult(mobilePage, await search(mobilePage));
  await cinemaReady(mobilePage, mobileSelection.data.location.name);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile capture must not overflow horizontally.');
  // Capture the rendered scene, including its attribution, rather than cropping it at the viewport edge.
  await screenshot(mobilePage, '08-mobile.png', 'Interface adaptada para smartphone', { locator: '.explorer-scene' });
  await mobileContext.close();
  return { suggestion };
}

async function scene(page, id, name, text, minimumSeconds, action) {
  const start = seconds();
  const events = [];
  const note = detail => events.push({ time: seconds(), detail });
  await action(note);
  const remaining = minimumSeconds - (seconds() - start);
  // Reading time follows verified states; it is never used to assume loading completed.
  if (remaining > 0) await page.waitForTimeout(remaining * 1000);
  timeline.push({ id, name, start, end: seconds(), text, events });
  console.log(`Recorded scene ${id}: ${name} (${start}s–${seconds()}s)`);
}

async function recordVideo() {
  for (const filename of ['01-home.png', '02-search.png', '03-map.png', '04-cinematic.png', '05-details.png', '06-gallery.png', '07-favorites.png', '08-mobile.png']) {
    assert(existsSync(path.join(screenshotsDirectory, filename)), 'Produce and inspect all eight screenshots before recording.');
  }
  const context = await browser.newContext({ viewport: videoViewport, deviceScaleFactor: 1, locale: 'pt-BR', reducedMotion: 'no-preference', recordVideo: { dir: rawDirectory, size: videoViewport, fps: 30 } });
  const pageCreationStarted = performance.now();
  const page = await context.newPage();
  clockStart = performance.now();
  const recording = page.video();
  let data;
  await scene(page, 1, 'Apresentação', 'World Explorer permite descobrir lugares do planeta por meio de mapas, fotografias e informações geográficas.', 9, async note => {
    await ready(page);
    note('Tela inicial real carregada; fontes e animações originais concluídas.');
  });
  await scene(page, 2, 'Pesquisa dinâmica', 'A pesquisa encontra destinos nas fontes públicas, sem depender de uma lista de lugares cadastrados.', 12, async note => {
    await page.getByRole('button', { name: 'Comece a explorar' }).click();
    await waitForMap(page);
    const input = await search(page, true);
    note(`Pesquisa real digitada: ${query}.`);
    await page.waitForTimeout(2400);
    const selected = await selectResult(page, input);
    data = selected.data;
    note(`Selecionado: ${data.location.name}; resposta real recebida.`);
  });
  await scene(page, 3, 'Mapa interativo', 'O mapa OpenStreetMap mostra a localização selecionada. Navegue pela cartografia e aproxime os detalhes.', 12, async note => {
    await waitForMap(page);
    await page.locator('.leaflet-control-zoom-in').click();
    await waitForMap(page);
    note('Zoom realizado no mapa real; cartografia e atribuição visíveis.');
    const bounds = await page.getByRole('region', { name: /^Mapa interativo do OpenStreetMap/ }).boundingBox();
    assert(bounds, 'The map must have a real visible bounding box.');
    await page.mouse.move(bounds.x + bounds.width * 0.67, bounds.y + bounds.height * 0.53);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.58, { steps: 25 });
    await page.mouse.up();
    await waitForMap(page);
    note('Mapa deslocado com gesto real de arrastar.');
  });
  await scene(page, 4, 'Experiência cinematográfica', 'Depois da seleção, fotografias e informações disponíveis revelam o destino em uma experiência cinematográfica.', 11, async note => {
    await page.getByRole('button', { name: 'Abrir experiência' }).click();
    await cinemaReady(page, data.location.name);
    note(`Fotografia principal real carregada: ${data.photos[0].id}.`);
  });
  await scene(page, 5, 'Informações e fontes', 'Wikipedia e Wikidata oferecem informações históricas e geográficas. Os dados apresentados possuem links para suas fontes.', 13, async note => {
    await page.getByRole('button', { name: 'Conheça este lugar' }).click();
    const dialog = page.getByRole('dialog', { name: data.location.name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.facts-grid')).toBeVisible();
    note('Resumo e fatos documentados visíveis no diálogo real.');
    await page.waitForTimeout(4000);
    await dialog.evaluate(element => element.scrollTo({ top: 420, behavior: 'smooth' }));
    note('Rolagem pelas informações e links de consulta.');
  });
  await scene(page, 6, 'Galeria e lugares próximos', 'Navegue pelas fotografias e descubra lugares próximos. As imagens disponíveis dependem das fontes de cada destino.', 15, async note => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Próxima fotografia' }).click();
    await expect(page.locator('.photo-counter > span').first()).toHaveText('02');
    await cinemaReady(page, data.location.name);
    note(`Galeria navegada: ${data.photos[1].id}.`);
    await page.waitForTimeout(3600);
    if (data.nearby.length) {
      await page.getByRole('button', { name: 'Continue a descoberta' }).click();
      await expect(page.getByRole('heading', { name: 'Logo ali, outro mundo.' })).toBeVisible();
      await nearbyImagesLoaded(page);
      note('Cartões reais de locais próximos e créditos exibidos.');
      await page.waitForTimeout(4000);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await expect(page.getByRole('button', { name: 'Salvar nos favoritos' })).toBeInViewport();
  });
  await scene(page, 7, 'Favoritos e histórico', 'Salve um destino nos favoritos e consulte as explorações recentes. Ao reabrir, o conteúdo é consultado novamente.', 16, async note => {
    await page.getByRole('button', { name: 'Salvar nos favoritos' }).click();
    await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Seus lugares' }).click();
    await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(1);
    note('Destino salvo; aba Favoritos apresenta a referência.');
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: /^Recentes/ }).click();
    await expect(page.getByRole('dialog').locator('.saved-place')).toHaveCount(1);
    note('Histórico real exibido na aba Recentes.');
    await page.waitForTimeout(3500);
    const request = page.waitForResponse(response => new URL(response.url()).pathname === '/api/destination' && response.request().method() === 'POST');
    await page.getByRole('dialog').locator('.saved-place').first().click();
    await destinationFromResponse(await request);
    await cinemaReady(page, data.location.name);
    note('Referência recente reaberta; nova consulta real concluída.');
  });
  await scene(page, 8, 'Encerramento', 'WORLD EXPLORER — Explore o mundo de uma nova maneira. github.com/Helio965/Globe-Express', 10, async note => {
    await page.getByRole('button', { name: 'World Explorer, início' }).click();
    await expect(page.locator('.welcome-title')).toBeVisible();
    await animationComplete(page, '[data-intro]');
    note('Retorno à tela inicial real. Texto final será adicionado somente na edição audiovisual.');
  });
  await healthy(page);
  await context.close();
  const output = path.join(rawDirectory, 'world-explorer-browser.webm');
  await recording.saveAs(output);
  return { recording: output, viewport: videoViewport, fps: 30, duration: seconds(), possibleRecorderLeadSeconds: Number(((clockStart - pageCreationStarted) / 1000).toFixed(3)), timelineClock: 'Monotonic clock starts immediately after page creation. Inspect raw first frames and calibrate any recorder lead before rendering subtitles.', finalComposition: '1920 × 1080: browser 1920 × 960 plus 120 px subtitle band outside the original interface', timeline };
}

function sourceMetadata() {
  return [...destinations.values()].map(data => ({
    location: data.location,
    sources: data.sources,
    warnings: data.warnings,
    summaryCharacters: data.summary.length,
    factCount: data.facts.length,
    photos: data.photos,
    nearby: data.nearby.map(place => ({ location: place.location, distanceKm: place.distanceKm, ...(place.photo ? { photo: place.photo } : {}) })),
  }));
}

let result;
try {
  result = mode === 'screenshots' ? await captureScreenshots() : await recordVideo();
  await Promise.all([...pendingObservations]);
  assert.equal(issues.length, 0, 'Real capture reported problems; review the issue log before publishing.');
  assert(network.some(entry => entry.host === 'tile.openstreetmap.org' && entry.status === 200), 'Real OpenStreetMap tiles must have loaded successfully.');
  assert(network.some(entry => entry.host.endsWith('wikimedia.org') && entry.status === 200), 'Real Wikimedia images must have loaded successfully.');
} catch (error) {
  issues.push({ type: 'capture', message: error.stack || error.message });
  process.exitCode = 1;
} finally {
  await browser.close();
  await Promise.all([...pendingObservations]);
  const manifest = { schemaVersion: 1, mode, createdAt: new Date().toISOString(), sourceGitSHA: gitSHA, sourceRepository: 'https://github.com/Helio965/Globe-Express', provider: 'open', searchInput: query, tlsVerification: true, mockedResponses: false, reducedMotion: 'no-preference', screenshots: captures, destinations: sourceMetadata(), metadataQueries, networkSummary: Object.fromEntries([...new Set(network.map(entry => entry.host))].map(host => [host, { responses: network.filter(entry => entry.host === host).length, successfulResponses: network.filter(entry => entry.host === host && entry.status === 200).length, statuses: [...new Set(network.filter(entry => entry.host === host).map(entry => entry.status))] }])), issues, ...result };
  const output = mode === 'screenshots' ? path.join(mediaDirectory, 'capture-manifest.json') : path.join(rawDirectory, 'recording-manifest.json');
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  if (mode === 'record') await writeFile(path.join(rawDirectory, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`);
  console.log(`Manifest: ${output}`);
  if (issues.length) console.error(JSON.stringify(issues, null, 2));
}
