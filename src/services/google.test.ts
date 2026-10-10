import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGooglePhotoUrl, googlePhotos, googlePlaceToPlace, isAllowedPhotoUrl, resolveGoogle, reverseGoogle, searchGoogle } from "./google";

beforeEach(() => vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "secret-server-credential"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Google Places New protocol", () => {
  it("sends an autocomplete session and terminates it with Details using the same token", async () => {
    const token = "4d127f92-d124-49d6-bb35-5675b82791fd";
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ suggestions: [{ placePrediction: { placeId: "ChIJExample", structuredFormat: { mainText: { text: "Lisboa" } } } }] }))
      .mockResolvedValueOnce(Response.json({ id: "ChIJExample", displayName: { text: "Lisboa" }, location: { latitude: 38.7, longitude: -9.1 } }));
    vi.stubGlobal("fetch", fetch);
    const suggestions = await searchGoogle("Lisboa", token);
    await resolveGoogle("ChIJExample", token);
    expect(suggestions[0].ref).toEqual({ provider: "google", id: "ChIJExample" });
    expect(JSON.parse(fetch.mock.calls[0][1].body).sessionToken).toBe(token);
    expect(String(fetch.mock.calls[1][0])).toContain(`sessionToken=${token}`);
    expect(fetch.mock.calls[1][1].headers).toHaveProperty("X-Goog-FieldMask");
    expect(String(fetch.mock.calls[1][0])).not.toContain("secret-server-credential");
  });

  it("preserves clicked coordinates even when geocoding returns an address elsewhere", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "OK", results: [{
      place_id: "nearest-address", formatted_address: "Centro, Cidade", geometry: { location: { lat: 10, lng: 20 } },
      address_components: [{ long_name: "Cidade", types: ["locality"] }],
    }] })));
    const coordinates = { lat: 10.1234, lng: 20.5432 };
    const place = await reverseGoogle(coordinates);
    expect(place.coordinates).toEqual(coordinates);
    expect(place.ref).toEqual({ provider: "coordinates", ...coordinates });
  });

  it("retains all photo author names, credits and proxy references", () => {
    const [photo] = googlePhotos({ id: "abc", displayName: { text: "Destino" }, photos: [{
      name: "places/abc/photos/token", widthPx: 1600, heightPx: 1000,
      authorAttributions: [{ displayName: "Autora A", uri: "https://maps.google.com/author/a" }, { displayName: "Autor B" }],
    }] });
    expect(photo.author).toBe("Autora A, Autor B");
    expect(photo.source).toBe("Google Places");
    expect(photo.url).toMatch(/^\/api\/photo\?/);
    expect(photo.url).not.toContain("secret-server-credential");
    expect(photo).toHaveProperty("attributions", [{ name: "Autora A", url: "https://maps.google.com/author/a" }, { name: "Autor B", url: undefined }]);
  });

  it("rejects impossible coordinates returned by the upstream service", () => {
    expect(() => googlePlaceToPlace({ id: "abc", location: { latitude: 91, longitude: 0 } })).toThrow();
    expect(() => googlePlaceToPlace({ id: "abc", location: { latitude: 0, longitude: -181 } })).toThrow();
  });
});

describe("photo proxy security", () => {
  it.each([
    "https://googleusercontent.com.attacker.test/a",
    "https://evilgoogleusercontent.com/a",
    "http://lh3.googleusercontent.com/a",
    "https://user:pass@lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com:444/a",
    "https://lh3.googleusercontent.com/a?key=secret",
    "javascript:alert(1)",
  ])("refuses unsafe redirect %s", url => expect(isAllowedPhotoUrl(url)).toBe(false));

  it("fetches photo metadata without exposing the server key in the redirect", async () => {
    const target = "https://lh3.googleusercontent.com/places/sample";
    const fetch = vi.fn().mockResolvedValue(Response.json({ photoUri: target }));
    vi.stubGlobal("fetch", fetch);
    await expect(getGooglePhotoUrl("places/abc/photos/token", 600)).resolves.toBe(target);
    expect(String(fetch.mock.calls[0][0])).toContain("skipHttpRedirect=true");
    expect(String(fetch.mock.calls[0][0])).not.toContain("secret-server-credential");
    expect(fetch.mock.calls[0][1].headers["X-Goog-Api-Key"]).toBe("secret-server-credential");
  });

  it("rejects path traversal without making a network request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(getGooglePhotoUrl("places/abc/photos/../secret", 600)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
