import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = process.env.WORLD_EXPLORER_URL || 'http://127.0.0.1:3000';
let failures = 0;

async function request(path, { body, expectedStatus = 200 } = {}) {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const envelope = await response.json();
  assert.equal(response.status, expectedStatus, `${path}: ${envelope.error?.message || `HTTP ${response.status}`}`);
  if (expectedStatus !== 200) {
    assert.ok(envelope.error?.code && envelope.error?.message, `${path}: erro sem código ou mensagem`);
    return envelope;
  }
  assert.ok(Object.hasOwn(envelope, 'data'), `${path}: resposta sem data`);
  return envelope.data;
}

function validCoordinates(coordinates) {
  assert.ok(Number.isFinite(coordinates?.lat) && Math.abs(coordinates.lat) <= 90, 'Latitude inválida');
  assert.ok(Number.isFinite(coordinates?.lng) && Math.abs(coordinates.lng) <= 180, 'Longitude inválida');
}

async function check(label, run) {
  try {
    console.log(`PASS ${label}: ${await run()}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Acceptance inputs only; no fixtures or destination catalog enter the application.
const cases = [
  ['Brasília', /bras[ií]lia/i],
  ['Pirâmides de Gizé', /giz[eé]|giza|pyramid/i],
  ['Monte Everest', /everest/i],
  ['Yosemite National Park', /yosemite/i],
  ['Praia de Copacabana', /copacabana/i],
  ['Tóquio', /^(t[oó]quio|tokyo)$/i],
];

for (const [query, name] of cases) {
  await check(query, async () => {
    const sessionToken = randomUUID();
    const suggestions = await request(`/api/search?${new URLSearchParams({ q: query, sessionToken })}`);
    assert.ok(Array.isArray(suggestions), 'Busca não retornou uma lista');
    const selected = suggestions.find(item => name.test(item.title));
    assert.ok(selected, `Nenhum resultado geográfico correspondente a ${query}`);
    const destination = await request('/api/destination', { body: { reference: selected.reference, sessionToken } });
    const { location, photos, nearby, sources, warnings } = destination;
    validCoordinates(location.coordinates);
    assert.ok(name.test(location.name), `Identidade inesperada: ${location.name}`);
    assert.ok(Array.isArray(photos) && Array.isArray(nearby) && Array.isArray(sources) && Array.isArray(warnings), 'Listas de conteúdo inválidas');
    assert.ok(sources.length > 0, 'Destino sem fontes documentadas');
    for (const source of sources) assert.ok(source.name && source.url?.startsWith('https://'), 'Fonte incompleta');
    for (const photo of photos) {
      assert.ok(photo.author && photo.license && photo.sourceUrl?.startsWith('https://'), 'Créditos incompletos');
      assert.ok(photo.url?.startsWith('https://') || photo.url?.startsWith('/api/photo?') || photo.url?.startsWith('/api/photos?'), 'URL de fotografia inválida');
    }
    if (!photos.length) assert.ok(warnings.some(item => /foto|photograph/i.test(`${item.service} ${item.message}`)), 'Ausência de fotografias sem aviso');
    return `${location.name}; ${photos.length} fotografias, ${nearby.length} locais próximos, ${sources.length} fontes, ${warnings.length} avisos (${selected.reference.provider})`;
  });
}

const ocean = { lat: 0, lng: -140 };
await check('Ponto oceânico', async () => {
  const reverse = await request(`/api/reverse?${new URLSearchParams({ lat: String(ocean.lat), lng: String(ocean.lng) })}`);
  assert.deepEqual(reverse.coordinates, ocean);
  assert.deepEqual(reverse.reference, { provider: 'coordinates', ...ocean });
  const remote = await request('/api/destination', { body: { reference: { provider: 'coordinates', ...ocean } } });
  assert.deepEqual(remote.location.coordinates, ocean);
  assert.deepEqual(remote.location.reference, { provider: 'coordinates', ...ocean });
  assert.equal(remote.photos.length, 0, 'Ponto oceânico recebeu fotografias de outro lugar');
  return 'coordenadas preservadas; nenhuma fotografia inventada';
});

await check('Pesquisa inexistente', async () => {
  const suggestions = await request(`/api/search?${new URLSearchParams({ q: 'zzzznonexistentplacexq99001', sessionToken: randomUUID() })}`);
  assert.deepEqual(suggestions, []);
  return 'nenhum resultado';
});

await check('Coordenadas inválidas', async () => {
  const result = await request('/api/reverse?lat=91&lng=0', { expectedStatus: 400 });
  assert.equal(result.error.code, 'INVALID_INPUT');
  return 'HTTP 400';
});

console.log(`Smoke real: ${cases.length + 3 - failures}/${cases.length + 3} verificações aprovadas.`);
process.exitCode = failures ? 1 : 0;
