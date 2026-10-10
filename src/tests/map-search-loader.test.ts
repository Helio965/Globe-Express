import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface TestScript {
  id: string;
  async: boolean;
  nonce: string;
  src: string;
  onerror?: () => void;
  remove: ReturnType<typeof vi.fn>;
}

interface TestWindow {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  dispatchEvent: ReturnType<typeof vi.fn>;
  __worldExplorerMapsReady?: () => void;
  gm_authFailure?: () => void;
}

describe('Google Maps script lifecycle', () => {
  let scripts: TestScript[];
  let testWindow: TestWindow;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'public-test-key');
    vi.stubGlobal('google', undefined);
    scripts = [];
    testWindow = { setTimeout, clearTimeout, dispatchEvent: vi.fn() };
    vi.stubGlobal('window', testWindow);
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => ({ nonce: 'existing-page-nonce' })),
      createElement: vi.fn(() => ({ remove: vi.fn() })),
      head: { appendChild: vi.fn((script: TestScript) => { scripts.push(script); }) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shares one in-flight load and carries the existing script nonce', async () => {
    const { loadGoogleMaps } = await import('@/components/map/google-loader');
    const first = loadGoogleMaps();
    const second = loadGoogleMaps();
    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].nonce).toBe('existing-page-nonce');
    expect(new URL(scripts[0].src).hostname).toBe('maps.googleapis.com');
    const maps = { Map: class {} };
    vi.stubGlobal('google', { maps });
    testWindow.__worldExplorerMapsReady?.();
    await expect(first).resolves.toBe(maps);
    await expect(second).resolves.toBe(maps);
    await expect(loadGoogleMaps()).resolves.toBe(maps);
    expect(scripts).toHaveLength(1);
  });

  it('rejects a failed network load and permits one fresh retry', async () => {
    const { loadGoogleMaps } = await import('@/components/map/google-loader');
    const first = loadGoogleMaps();
    const rejection = expect(first).rejects.toMatchObject({ reason: 'network' });
    scripts[0].onerror?.();
    await rejection;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
    const retry = loadGoogleMaps();
    expect(scripts).toHaveLength(2);
    const maps = { Map: class {} };
    vi.stubGlobal('google', { maps });
    testWindow.__worldExplorerMapsReady?.();
    await expect(retry).resolves.toBe(maps);
  });

  it('reports authentication failure and cannot claim readiness afterward', async () => {
    const { loadGoogleMaps, GOOGLE_MAPS_AUTH_FAILURE } = await import('@/components/map/google-loader');
    const pending = loadGoogleMaps();
    const rejection = expect(pending).rejects.toMatchObject({ reason: 'authentication' });
    testWindow.gm_authFailure?.();
    await rejection;
    expect(testWindow.dispatchEvent.mock.calls[0][0].type).toBe(GOOGLE_MAPS_AUTH_FAILURE);
    vi.stubGlobal('google', { maps: { Map: class {} } });
    await expect(loadGoogleMaps()).rejects.toMatchObject({ reason: 'authentication' });
    expect(scripts).toHaveLength(1);
  });

  it('finishes a timed-out request instead of leaving the map loading forever', async () => {
    const { loadGoogleMaps } = await import('@/components/map/google-loader');
    const pending = loadGoogleMaps();
    const rejection = expect(pending).rejects.toMatchObject({ reason: 'network' });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
    expect(scripts[0].remove).toHaveBeenCalledOnce();
  });

  it('does not send a Maps request when no browser key exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', '');
    const { loadGoogleMaps } = await import('@/components/map/google-loader');
    await expect(loadGoogleMaps()).rejects.toMatchObject({ reason: 'missing-key' });
    expect(scripts).toHaveLength(0);
  });
});
