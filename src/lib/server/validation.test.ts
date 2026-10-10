import { describe, expect, it } from "vitest";
import { coordinatesSchema, destinationSchema, photoQuerySchema, readJson, searchSchema } from "./validation";

describe("API input validation", () => {
  it("rejects impossible coordinates, traversal references and unexpected fields", () => {
    expect(coordinatesSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(coordinatesSchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
    expect(destinationSchema.safeParse({ ref: { provider: "google", id: "../secret" } }).success).toBe(false);
    expect(photoQuerySchema.safeParse({ name: "places/abc/photos/../admin", width: 600 }).success).toBe(false);
    expect(photoQuerySchema.safeParse({ name: "places/abc/photos/token", width: 600, url: "https://other.test" }).success).toBe(false);
  });

  it("requires UUID sessions and trims user search input", () => {
    expect(searchSchema.safeParse({ query: "Rio", sessionToken: "not-a-session" }).success).toBe(false);
    expect(searchSchema.parse({ query: "  Rio  ", sessionToken: "4d127f92-d124-49d6-bb35-5675b82791fd" }).query).toBe("Rio");
  });

  it("rejects oversized chunked bodies before parsing them", async () => {
    const request = new Request("https://example.test/api/search", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "a".repeat(9_000) }),
    });
    await expect(readJson(request, searchSchema)).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });

  it("treats malformed JSON and wrong media type as safe client errors", async () => {
    await expect(readJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }), searchSchema)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
    await expect(readJson(new Request("https://example.test", { method: "POST", body: "{}" }), searchSchema)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a safelisted media type disguising JSON in a parameter", async () => {
    const request = new Request("https://example.test", {
      method: "POST", headers: { "content-type": "text/plain; charset=application/json" }, body: JSON.stringify({ query: "Rio" }),
    });
    await expect(readJson(request, searchSchema)).rejects.toMatchObject({ status: 415 });
  });

  it("cancels an unfinished body stream at its deadline", async () => {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    const init = { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" };
    const request = new Request("https://example.test", init as RequestInit);
    await expect(readJson(request, searchSchema, 15)).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", status: 408 });
    expect(cancelled).toBe(true);
  });

  it("stops reading when the client cancels its request", async () => {
    const controller = new AbortController();
    const body = new ReadableStream();
    const init = { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body, duplex: "half" };
    const request = new Request("https://example.test", init as RequestInit);
    const pending = readJson(request, searchSchema);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "REQUEST_TIMEOUT", status: 408 });
  });
});
