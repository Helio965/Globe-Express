import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "@/types/explorer";
import { ServiceError } from "@/lib/server/http";

vi.mock("./google", () => ({
  hasGoogleKey: vi.fn(), searchGoogle: vi.fn(), resolveGoogle: vi.fn(), resolveGoogleLocation: vi.fn(), nearbyGoogle: vi.fn(), reverseGoogle: vi.fn(),
}));
vi.mock("./wikimedia", () => ({
  searchWikipedia: vi.fn(), resolveWikipedia: vi.fn(), enrichWikipedia: vi.fn(), nearbyWikipedia: vi.fn(), reverseWikipedia: vi.fn(),
}));
import * as google from "./google";
import * as wiki from "./wikimedia";
import { loadDestination, resolvePlace, reverseLocation, searchDestinations } from "./destinations";

const place: Place = {
  ref: { provider: "google", id: "abc" }, id: "google:abc", name: "Lugar real", address: "Endereço",
  coordinates: { lat: -22.9, lng: -43.2 }, source: "Google Maps",
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("destination orchestration", () => {
  it("uses real Wikipedia adapters and declares limited coverage when no Google key exists", async () => {
    vi.mocked(google.hasGoogleKey).mockReturnValue(false);
    const suggestions = [{ ref: { provider: "wikipedia" as const, language: "pt" as const, id: "Recife" }, label: "Recife", description: "Pernambuco" }];
    vi.mocked(wiki.searchWikipedia).mockResolvedValue(suggestions);
    const result = await searchDestinations("Recife");
    expect(result.provider).toBe("wikipedia");
    expect(result.suggestions).toEqual(suggestions);
    expect(result.warnings.join(" ")).toContain("limitada");
    expect(google.searchGoogle).not.toHaveBeenCalled();
    expect(wiki.searchWikipedia).toHaveBeenCalledWith("Recife", expect.any(AbortSignal));
  });

  it("surfaces Google quota errors when a Wikipedia fallback succeeds", async () => {
    vi.mocked(google.hasGoogleKey).mockReturnValue(true);
    vi.mocked(google.searchGoogle).mockRejectedValue(new ServiceError("PROVIDER_QUOTA", "Quota", 503));
    vi.mocked(wiki.searchWikipedia).mockResolvedValue([]);
    const result = await searchDestinations("Recife");
    expect(result.provider).toBe("wikipedia");
    expect(result.warnings.join(" ")).toContain("limite");
  });

  it("keeps a Google location and nearby results when encyclopedia enrichment fails", async () => {
    vi.mocked(google.hasGoogleKey).mockReturnValue(true);
    vi.mocked(google.resolveGoogle).mockResolvedValue({ place, photos: [] });
    vi.mocked(wiki.enrichWikipedia).mockRejectedValue(new Error("Wikipedia unavailable"));
    vi.mocked(google.nearbyGoogle).mockResolvedValue([{ place: { ...place, id: "another", name: "Museu" } }]);
    const result = await loadDestination(place.ref);
    expect(result.place).toEqual(place);
    expect(result.nearby).toHaveLength(1);
    expect(result.summary).toBe("");
    expect(result.warnings.join(" ")).toContain("localização continua disponível");
  });

  it("preserves exact clicked coordinates if all reverse providers fail", async () => {
    vi.mocked(google.hasGoogleKey).mockReturnValue(true);
    vi.mocked(google.reverseGoogle).mockRejectedValue(new Error("quota"));
    vi.mocked(wiki.reverseWikipedia).mockRejectedValue(new Error("timeout"));
    const coordinates = { lat: 12.34567, lng: -23.45678 };
    const result = await reverseLocation(coordinates);
    expect(result.coordinates).toEqual(coordinates);
    expect(result.ref).toEqual({ provider: "coordinates", ...coordinates });
    expect(result.source).toBe("Coordinates");
  });

  it("refreshes a saved Google label without requesting photos or enrichment", async () => {
    vi.mocked(google.resolveGoogleLocation).mockResolvedValue(place);
    expect(await resolvePlace(place.ref)).toEqual(place);
    expect(google.resolveGoogleLocation).toHaveBeenCalledOnce();
    expect(google.resolveGoogle).not.toHaveBeenCalled();
    expect(wiki.enrichWikipedia).not.toHaveBeenCalled();
  });

  it("does not turn a cancelled reverse request into a coordinate fallback", async () => {
    const controller = new AbortController();
    vi.mocked(google.hasGoogleKey).mockReturnValue(false);
    vi.mocked(wiki.reverseWikipedia).mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    await expect(reverseLocation({ lat: 10, lng: 20 }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates request cancellation after parallel enrichment settles", async () => {
    const controller = new AbortController();
    vi.mocked(google.hasGoogleKey).mockReturnValue(true);
    vi.mocked(google.resolveGoogle).mockResolvedValue({ place, photos: [] });
    vi.mocked(wiki.enrichWikipedia).mockImplementation(async () => {
      controller.abort();
      throw controller.signal.reason;
    });
    await expect(loadDestination(place.ref, undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(wiki.nearbyWikipedia).not.toHaveBeenCalled();
  });
});
