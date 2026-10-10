import { describe, expect, it, vi } from 'vitest';
import { coordinatesSchema, destinationRequestSchema, referenceSchema, reverseRequestSchema, searchRequestSchema } from '@/lib/validation';
import { distanceKm, formatCoordinates, referenceKey } from '@/lib/format';
import { FAVORITES_KEY, parseSavedPlaces, readSavedPlaces, rememberPlace, savePlaces, toggleSavedPlace, type PlaceStorage } from '@/lib/saved-places';
import { LatestRequest } from '@/lib/latest-request';
import type { PlaceReference } from '@/types/explorer';

const wikipedia: PlaceReference = { provider: 'wikipedia', id: '123', language: 'pt' };
const google: PlaceReference = { provider: 'google', id: 'ChIJverified_123' };
const coordinates: PlaceReference = { provider: 'coordinates', lat: -22.9, lng: -43.2 };

describe('untrusted geographic inputs', () => {
  it('accepts terrestrial boundary coordinates and rejects extra properties', () => {
    expect(coordinatesSchema.parse({ lat: -90, lng: 180 })).toEqual({ lat: -90, lng: 180 });
    expect(coordinatesSchema.safeParse({ lat: 0, lng: 0, elevation: 1 }).success).toBe(false);
  });
  it.each([
    { lat: Number.NaN, lng: 0 }, { lat: Number.POSITIVE_INFINITY, lng: 0 },
    { lat: 0, lng: Number.NEGATIVE_INFINITY }, { lat: 90.001, lng: 0 },
    { lat: -90.001, lng: 0 }, { lat: 0, lng: 180.001 }, { lat: 0, lng: -180.001 },
    { lat: '0', lng: 0 },
  ])('rejects invalid coordinates %j', point => {
    expect(coordinatesSchema.safeParse(point).success).toBe(false);
  });
  it('allows only explicitly supported provider references', () => {
    for (const reference of [wikipedia, google, coordinates]) expect(referenceSchema.safeParse(reference).success).toBe(true);
    for (const reference of [
      { provider: 'http', id: 'https://example.org' },
      { provider: 'google', id: '../secret' },
      { provider: 'google', id: 'https://example.org' },
      { provider: 'wikipedia', id: '0', language: 'pt' },
      { provider: 'wikipedia', id: '123', language: 'de' },
      { ...google, name: 'Google content must not be persisted' },
    ]) expect(referenceSchema.safeParse(reference).success).toBe(false);
  });
  it('validates destination envelopes and UUID sessions strictly', () => {
    expect(destinationRequestSchema.safeParse({ reference: wikipedia, sessionToken: '9d004a18-d060-4262-bb38-55a6ee2ee5b8' }).success).toBe(true);
    expect(destinationRequestSchema.safeParse({ reference: wikipedia, sessionToken: 'bad' }).success).toBe(false);
    expect(destinationRequestSchema.safeParse({ reference: wikipedia, url: 'https://example.org' }).success).toBe(false);
  });
  it('trims search, rejects blank/short/oversized searches and unknown keys', () => {
    expect(searchRequestSchema.parse({ q: '  Rio  ' }).q).toBe('Rio');
    for (const input of [{ q: '' }, { q: '  ' }, { q: 'R' }, { q: 'x'.repeat(161) }, { q: 'Rio', provider: 'evil' }]) {
      expect(searchRequestSchema.safeParse(input).success).toBe(false);
    }
  });
  it('coerces numeric reverse-query coordinates but rejects nonfinite values', () => {
    expect(reverseRequestSchema.parse({ lat: '-22.9', lng: '-43.2' })).toEqual({ lat: -22.9, lng: -43.2 });
    for (const lat of ['Infinity', 'NaN', '91', 'oops', '', ' ', null]) expect(reverseRequestSchema.safeParse({ lat, lng: '0' }).success).toBe(false);
  });
});

describe('coordinates and distance', () => {
  it('formats both hemispheres and western longitude in Portuguese', () => {
    expect(formatCoordinates({ lat: -22.9, lng: -43.2 })).toBe('22.9000° S · 43.2000° O');
    expect(formatCoordinates({ lat: 35.7, lng: 139.7 })).toBe('35.7000° N · 139.7000° L');
    expect(formatCoordinates({ lat: 0, lng: 0 })).toBe('0.0000° N · 0.0000° L');
  });
  it('computes identical, known intercity and antipodal distances', () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    expect(distanceKm({ lat: 51.5074, lng: -0.1278 }, { lat: 40.7128, lng: -74.006 })).toBeCloseTo(5570.2, 0);
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * 6371, 5);
  });
  it('uses the short distance across the dateline and is symmetric', () => {
    const a = { lat: -10, lng: 179.9 }, b = { lat: -10, lng: -179.9 };
    expect(distanceKm(a, b)).toBeGreaterThan(20);
    expect(distanceKm(a, b)).toBeLessThan(23);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });
  it('normalizes coordinate references to stable six-decimal storage identities', () => {
    expect(referenceKey({ provider: 'coordinates', lat: 1.00000001, lng: -2 })).toBe(referenceKey({ provider: 'coordinates', lat: 1, lng: -2 }));
    expect(referenceKey(wikipedia)).not.toBe(referenceKey({ ...wikipedia, language: 'en' }));
    expect(referenceKey(google)).toBe('google:ChIJverified_123');
  });
});

describe('privacy-preserving saved places', () => {
  it.each([null, '', 'not json', '{"not":"array"}', 'null', '[', ' '.repeat(50001)])('survives malformed storage %s', raw => {
    expect(parseSavedPlaces(raw)).toEqual([]);
  });
  it('drops untrusted records and deduplicates valid normalized references', () => {
    expect(parseSavedPlaces(JSON.stringify([wikipedia, wikipedia, { provider: 'coordinates', lat: 1.00000001, lng: 2 }, { provider: 'coordinates', lat: 1, lng: 2 }, { ...google, photos: ['private Google content'] }, null]))).toEqual([wikipedia, { provider: 'coordinates', lat: 1, lng: 2 }]);
  });
  it('caps favorites at 50 records and recent history at 20', () => {
    const records: PlaceReference[] = Array.from({ length: 100 }, (_, i) => ({ provider: 'wikipedia', language: 'pt', id: String(i + 1) }));
    expect(parseSavedPlaces(JSON.stringify(records))).toHaveLength(50);
    expect(toggleSavedPlace(records.slice(0, 50), google)).toHaveLength(50);
    expect(rememberPlace(records, google)).toHaveLength(20);
  });
  it('stores identifiers alone, dropping injected Google names, addresses, descriptions and photo URLs', () => {
    const storage: PlaceStorage = { getItem: () => null, setItem: vi.fn() };
    const extraContent = { ...google, name: 'Google name', address: 'private address', summary: 'licensed description', photo: 'https://googleusercontent.com/image' };
    expect(savePlaces(storage, FAVORITES_KEY, [google, extraContent])).toBe(true);
    const serialized = vi.mocked(storage.setItem).mock.calls[0][1];
    expect(JSON.parse(serialized)).toEqual([google]);
    expect(serialized).not.toMatch(/name|address|summary|photo|googleusercontent/);
  });
  it('handles inaccessible localStorage and exhausted quota without throwing', () => {
    const inaccessible: PlaceStorage = { getItem: () => { throw new DOMException('Denied', 'SecurityError'); }, setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); } };
    expect(readSavedPlaces(inaccessible, FAVORITES_KEY)).toEqual([]);
    expect(savePlaces(inaccessible, FAVORITES_KEY, [google])).toBe(false);
  });
  it('toggles a place and moves revisited destinations to the front without duplicates', () => {
    expect(toggleSavedPlace([google, wikipedia], google)).toEqual([wikipedia]);
    expect(toggleSavedPlace([wikipedia], google)).toEqual([google, wikipedia]);
    expect(rememberPlace([wikipedia, google, coordinates], google)).toEqual([google, wikipedia, coordinates]);
  });
});

describe('latest destination request wins', () => {
  it('aborts a prior request immediately and prevents stale completion', async () => {
    const requests = new LatestRequest();
    const first = requests.next();
    let settleFirst!: (value: string) => void;
    const firstResult = new Promise<string>(resolve => { settleFirst = resolve; });
    const state: string[] = [];
    const firstWork = firstResult.then(value => { if (first.isCurrent()) state.push(value); });
    const second = requests.next();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    if (second.isCurrent()) state.push('destination B');
    settleFirst('destination A');
    await firstWork;
    expect(state).toEqual(['destination B']);
  });
  it('cancels outstanding work, invalidates its revision and can be reused', () => {
    const requests = new LatestRequest();
    requests.cancel();
    const pending = requests.next();
    requests.cancel();
    expect(pending.signal.aborted).toBe(true);
    expect(pending.isCurrent()).toBe(false);
    expect(requests.next().isCurrent()).toBe(true);
  });
});
