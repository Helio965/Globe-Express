import { describe, expect, it } from "vitest";
import { readRefs, refKey, RequestGate, saveRefs, toggleRef } from "./client";
import type { PlaceRef } from "@/types/explorer";

describe("latest destination request", () => {
  it("aborts and invalidates an old request when another destination is selected", () => {
    const gate = new RequestGate();
    const first = gate.begin();
    const second = gate.begin();
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    gate.cancel();
    expect(second.signal.aborted).toBe(true);
    expect(second.isCurrent()).toBe(false);
  });
});

describe("saved references", () => {
  const ref: PlaceRef = { provider: "google", id: "ChIJ-test" };
  it("stores only reference data and toggles duplicates out", () => {
    const toggled = toggleRef([], ref);
    let saved = "";
    expect(saveRefs({ setItem: (_key, value) => { saved = value; } }, "favorites", toggled)).toBe(true);
    expect(JSON.parse(saved)).toEqual([{ provider: "google", id: "ChIJ-test" }]);
    expect(toggleRef(toggled, { ...ref })).toEqual([]);
  });

  it("ignores corrupt or out-of-range persisted data while retaining valid references", () => {
    const storage = { getItem: () => JSON.stringify([ref, { provider: "coordinates", lat: 95, lng: 0 }, { provider: "wikipedia", id: "10", language: "fr" }, null]) };
    expect(readRefs(storage, "favorites")).toEqual([ref]);
    expect(readRefs({ getItem: () => "{" }, "favorites")).toEqual([]);
    expect(readRefs({ getItem: () => { throw new Error("storage disabled"); } }, "favorites")).toEqual([]);
    expect(saveRefs({ setItem: () => { throw new Error("full"); } }, "favorites", [ref])).toBe(false);
  });

  it("distinguishes provider identity and retains both coordinate components", () => {
    expect(refKey({ provider: "coordinates", lat: -15.5, lng: -47.5 })).toBe("coordinates:-15.5:-47.5");
    expect(refKey({ provider: "wikipedia", id: "10", language: "pt" })).not.toBe(refKey({ provider: "wikipedia", id: "10", language: "en" }));
    const many = Array.from({ length: 40 }, (_item, index): PlaceRef => ({ provider: "google", id: `place-${index}` }));
    expect(toggleRef(many, ref)).toHaveLength(30);
  });

  it("normalizes older saved records to strict API references and strips provider content", () => {
    const older = { provider: "google", id: "ChIJ-test", name: "Provider name", photo: "https://example.test/photo", description: "Provider text" };
    const stored = readRefs({ getItem: () => JSON.stringify([older, { provider: "wikipedia", id: "article-title", language: "pt" }]) }, "favorites");
    expect(stored).toEqual([ref]);
    let json = "";
    saveRefs({ setItem: (_key, value) => { json = value; } }, "favorites", [older as PlaceRef]);
    expect(JSON.parse(json)).toEqual([ref]);
  });
});
