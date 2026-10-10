import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';
import type { Destination, Location } from '@/types/explorer';

const service = vi.hoisted(() => ({ openSearch: vi.fn(), googleSearch: vi.fn(), resolve: vi.fn(), complete: vi.fn() }));
vi.mock('@/services/open-provider', () => ({ openSearch: service.openSearch }));
vi.mock('@/services/destination', () => ({ resolveDestination: service.resolve, completeDestination: service.complete }));
vi.mock('@/services/google', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/google')>();
  return { ...real, googleSearch: service.googleSearch };
});
import { GET as search } from '@/app/api/search/route';
import { POST as destination } from '@/app/api/destination/route';
import { GET as reverse } from '@/app/api/reverse/route';
import { GET as photos } from '@/app/api/photos/route';
import { GET as config } from '@/app/api/config/route';
import { GET as health } from '@/app/api/health/route';

// Route tests replace only upstream service boundaries. All request guards,
// schemas, stream handling, response contracts and photo-name validation run.
const location: Location = { reference: { provider: 'wikipedia', id: '42', language: 'pt' }, name: 'Destino de teste', coordinates: { lat: -10, lng: -40 }, kind: 'fixture', attributions: [] };
const full: Destination = { location, summary: 'Texto de fixture, somente testes.', sections: [], photos: [], nearby: [], facts: [], sources: [], warnings: [] };
let serial = 0;
function request(path: string, init: RequestInit = {}) {
  return new Request(`https://explorer.test${path}`, { ...init, headers: { 'x-forwarded-for': `fixture-${++serial}`, ...init.headers } });
}
function post(body: unknown = { reference: location.reference }, headers: Record<string, string> = {}) {
  return request('/api/destination', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
async function errorOf(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ error: { code } });
}
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '');
  vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', '');
  service.openSearch.mockReset().mockResolvedValue([]);
  service.googleSearch.mockReset().mockResolvedValue([]);
  service.resolve.mockReset().mockResolvedValue({ location, photos: [], warnings: [] });
  service.complete.mockReset().mockResolvedValue(full);
});
afterEach(() => vi.unstubAllEnvs());

describe('search route', () => {
  it.each(['', '?q=', '?q=x', '?q=Rio&provider=evil', '?q=Rio&sessionToken=bad', `?q=${'x'.repeat(161)}`])('rejects malformed search %s before calling upstream', async query => {
    await errorOf(await search(request(`/api/search${query}`)), 400, 'INVALID_INPUT');
    expect(service.openSearch).not.toHaveBeenCalled();
    expect(service.googleSearch).not.toHaveBeenCalled();
  });
  it('returns an honest empty list with no-cache security headers', async () => {
    const response = await search(request('/api/search?q=Nowhere'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.json()).toEqual({ data: [] });
    expect(service.openSearch).toHaveBeenCalledWith('Nowhere', expect.any(AbortSignal));
  });
  it('selects Google only when browser and server keys are both present and forwards session', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'fixture-browser-key');
    vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', 'fixture-server-key');
    const token = '9d004a18-d060-4262-bb38-55a6ee2ee5b8';
    await search(request(`/api/search?q=Rio&sessionToken=${token}`));
    expect(service.googleSearch).toHaveBeenCalledWith('Rio', token, expect.any(AbortSignal));
    expect(service.openSearch).not.toHaveBeenCalled();
  });
  it('propagates quota status and retry hints without fabricating results', async () => {
    service.openSearch.mockRejectedValue(new ApiError('UPSTREAM_QUOTA', 'Aguarde.', 429, 30));
    const response = await search(request('/api/search?q=Rio'));
    expect(response.headers.get('retry-after')).toBe('30');
    await errorOf(response, 429, 'UPSTREAM_QUOTA');
  });
  it('rejects foreign origins before any provider call', async () => {
    await errorOf(await search(request('/api/search?q=Rio', { headers: { origin: 'https://attacker.test' } })), 403, 'ORIGIN_REJECTED');
    expect(service.openSearch).not.toHaveBeenCalled();
  });
  it('enforces the per-instance burst limit with a retry hint', async () => {
    const ip = `rate-fixture-${++serial}`;
    for (let i = 0; i < 40; i++) expect((await search(new Request('https://explorer.test/api/search?q=Rio', { headers: { 'x-forwarded-for': ip } }))).status).toBe(200);
    const response = await search(new Request('https://explorer.test/api/search?q=Rio', { headers: { 'x-forwarded-for': ip } }));
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    await errorOf(response, 429, 'RATE_LIMIT');
  });
});

describe('destination route', () => {
  it.each([
    { reference: { provider: 'coordinates', lat: 91, lng: 0 } },
    { reference: { provider: 'coordinates', lat: 'Infinity', lng: 0 } },
    { reference: { provider: 'unknown', id: '42' } },
    { reference: { provider: 'google', id: '../secret' } },
    { reference: { ...location.reference, url: 'https://attacker.test' } },
    { reference: location.reference, extra: 'untrusted' },
  ])('rejects unsafe destination %j', async body => {
    await errorOf(await destination(post(body)), 400, 'INVALID_INPUT');
    expect(service.resolve).not.toHaveBeenCalled();
  });
  it('rejects invalid JSON, content type and oversized bodies', async () => {
    await errorOf(await destination(request('/api/destination', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })), 400, 'INVALID_INPUT');
    await errorOf(await destination(post(undefined, { 'Content-Type': 'text/plain' })), 415, 'INVALID_CONTENT_TYPE');
    await errorOf(await destination(post({ reference: location.reference, padding: 'x'.repeat(12000) })), 413, 'INPUT_TOO_LARGE');
  });
  it('returns a fully composed JSON destination for ordinary API clients', async () => {
    const response = await destination(post());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: full });
    expect(service.complete).toHaveBeenCalledWith({ location, photos: [], warnings: [] }, expect.any(AbortSignal));
  });
  it('streams the location before destination enrichment resolves', async () => {
    let complete!: (value: Destination) => void;
    service.complete.mockImplementation(() => new Promise<Destination>(resolve => { complete = resolve; }));
    const response = await destination(post(undefined, { Accept: 'application/x-ndjson' }));
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(first.value))).toEqual({ type: 'location', location });
    complete(full);
    const second = await reader.read();
    expect(JSON.parse(new TextDecoder().decode(second.value))).toEqual({ type: 'destination', data: full });
    expect((await reader.read()).done).toBe(true);
  });
  it('keeps an identified location and streams a graceful enrichment failure', async () => {
    service.complete.mockRejectedValue(new ApiError('UPSTREAM_QUOTA', 'Cota de teste atingida.', 429));
    const response = await destination(post(undefined, { Accept: 'application/x-ndjson' }));
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events).toEqual([{ type: 'location', location }, { type: 'error', error: { code: 'UPSTREAM_QUOTA', message: 'Cota de teste atingida.' } }]);
  });
  it('does not expose internal exception messages through streams or JSON', async () => {
    service.resolve.mockRejectedValue(new Error('secret-server-key and stack details'));
    const json = await destination(post());
    await errorOf(json, 500, 'INTERNAL_ERROR');
    const streaming = await destination(post(undefined, { Accept: 'application/x-ndjson' }));
    const body = await streaming.text();
    expect(body).toContain('DESTINATION_FAILED');
    expect(body).not.toContain('secret-server-key');
  });
  it('aborts provider work when the client cancels the stream', async () => {
    let complete!: (value: Destination) => void;
    service.complete.mockImplementation(() => new Promise<Destination>(resolve => { complete = resolve; }));
    const response = await destination(post(undefined, { Accept: 'application/x-ndjson' }));
    const reader = response.body!.getReader();
    await reader.read();
    const signal = service.complete.mock.calls[0][1] as AbortSignal;
    await reader.cancel();
    expect(signal.aborted).toBe(true);
    complete(full);
  });
  it('rejects foreign-origin POSTs', async () => {
    await errorOf(await destination(post(undefined, { origin: 'https://attacker.test' })), 403, 'ORIGIN_REJECTED');
    expect(service.resolve).not.toHaveBeenCalled();
  });
  it('accepts a browser origin matching Host when Next binds to 0.0.0.0', async () => {
    const response = await destination(new Request('http://0.0.0.0:3001/api/destination', {
      method: 'POST', body: JSON.stringify({ reference: location.reference }),
      headers: { 'Content-Type': 'application/json', Host: '127.0.0.1:3001', Origin: 'http://127.0.0.1:3001', 'x-forwarded-for': `host-fixture-${++serial}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: full });
  });
  it('accepts the HTTPS browser origin supplied by a trusted deployment proxy', async () => {
    const response = await destination(new Request('http://0.0.0.0:3001/api/destination', {
      method: 'POST', body: JSON.stringify({ reference: location.reference }),
      headers: { 'Content-Type': 'application/json', Host: 'app.example', 'x-forwarded-proto': 'https', Origin: 'https://app.example', 'x-forwarded-for': `proxy-fixture-${++serial}` },
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: full });
  });
  it('still rejects a foreign origin when deployment proxy headers are present', async () => {
    const response = await destination(new Request('http://0.0.0.0:3001/api/destination', {
      method: 'POST', body: JSON.stringify({ reference: location.reference }),
      headers: { 'Content-Type': 'application/json', Host: 'app.example', 'x-forwarded-proto': 'https', Origin: 'https://attacker.test', 'x-forwarded-for': `rejected-proxy-${++serial}` },
    }));
    await errorOf(response, 403, 'ORIGIN_REJECTED');
    expect(service.resolve).not.toHaveBeenCalled();
  });
});

describe('reverse geocoding and photo boundary', () => {
  it.each(['?lat=Infinity&lng=0', '?lat=91&lng=0', '?lat=0&lng=-181', '?lat=hello&lng=0', '?lat=0', '?lat=&lng=0', '?lat=%20&lng=0', '?lat=0&lng=0&url=https://attacker.test'])('rejects invalid reverse input %s', async query => {
    await errorOf(await reverse(request(`/api/reverse${query}`)), 400, 'INVALID_INPUT');
    expect(service.resolve).not.toHaveBeenCalled();
  });
  it('preserves the exact selected hemisphere coordinates for reverse lookup', async () => {
    await reverse(request('/api/reverse?lat=-22.912345&lng=-43.198765'));
    expect(service.resolve).toHaveBeenCalledWith({ provider: 'coordinates', lat: -22.912345, lng: -43.198765 }, undefined, expect.any(AbortSignal));
  });
  it.each(['https://attacker.test/image', 'places/../photos/secret', 'places/valid/photos/../../secret', 'places/valid/photos/photo?key=secret', '//169.254.169.254/latest/meta-data', 'file:///etc/passwd'])('rejects unsafe photo reference %s with real provider validation', async name => {
    await errorOf(await photos(request(`/api/photos?name=${encodeURIComponent(name)}`)), 400, 'INVALID_PHOTO_REFERENCE');
  });
  it.each(['?width=100', '?name=places/valid/photos/photo&width=0', '?name=places/valid/photos/photo&width=4801', '?name=places/valid/photos/photo&width=NaN', '?name=places/valid/photos/photo&extra=bad'])('rejects malformed photo query %s', async query => {
    await errorOf(await photos(request(`/api/photos${query}`)), 400, 'INVALID_INPUT');
  });
  it('reports missing Google credentials for a syntactically valid photo without networking', async () => {
    await errorOf(await photos(request('/api/photos?name=places/valid/photos/photo')), 503, 'GOOGLE_NOT_CONFIGURED');
  });
});

describe('health and configuration', () => {
  it('provides health without returning credentials', async () => {
    const response = health();
    expect(await response.json()).toEqual({ data: { status: 'ok', application: 'World Explorer' } });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each([[false, false], [true, false], [false, true], [true, true]])('reports key presence, never values, for browser=%s server=%s', async (browser, server) => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', browser ? 'private-browser-fixture-key' : '');
    vi.stubEnv('GOOGLE_MAPS_SERVER_API_KEY', server ? 'private-server-fixture-key' : '');
    const body = await config().text();
    expect(JSON.parse(body)).toEqual({ data: { mapProvider: browser && server ? 'google' : 'open', googleConfigured: browser && server, googleBrowserKeyPresent: browser, googleServerKeyPresent: server } });
    expect(body).not.toContain('private-browser');
    expect(body).not.toContain('private-server');
  });
});
