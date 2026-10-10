import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./http";
import { errorResponse } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("upstream failures", () => {
  it("does not expose credentials in provider responses or thrown fetch errors", async () => {
    const secret = "private-server-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`provider rejected ${secret}`, { status: 403 })));
    const error = await fetchJson(`https://maps.googleapis.com?key=${secret}`).catch(value => value);
    const response = errorResponse(error);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(secret);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`network failure https://host?key=${secret}`)));
    const networkError = await fetchJson(`https://maps.googleapis.com?key=${secret}`).catch(value => value);
    expect(await errorResponse(networkError).text()).not.toContain(secret);
  });

  it("cancels a stalled provider at the deadline", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));
    await expect(fetchJson("https://example.test", {}, 15)).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
  });

  it("disables upstream caching and redirects while recognizing quota exhaustion", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchJson("https://example.test")).rejects.toMatchObject({ code: "PROVIDER_QUOTA", status: 503 });
    expect(fetch.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });
});
