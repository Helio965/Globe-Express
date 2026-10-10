import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/destinations", () => ({ searchDestinations: vi.fn(), loadDestination: vi.fn(), reverseLocation: vi.fn(), resolvePlace: vi.fn() }));
vi.mock("@/services/google", () => ({ getGooglePhotoUrl: vi.fn() }));
import { searchDestinations } from "@/services/destinations";
import { getGooglePhotoUrl } from "@/services/google";
import { POST as search } from "./search/route";
import { GET as photo } from "./photo/route";

function request(body: unknown, ip = "route-test") {
  return new Request("https://example.test/api/search", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body),
  });
}
beforeEach(() => vi.clearAllMocks());

describe("public API contracts", () => {
  it("rejects malformed input before contacting an upstream provider", async () => {
    const response = await search(request({ query: "Rio", sessionToken: "invalid" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(searchDestinations).not.toHaveBeenCalled();
  });

  it("limits repeated searches and returns a usable retry delay", async () => {
    vi.mocked(searchDestinations).mockResolvedValue({ suggestions: [], provider: "wikipedia", warnings: [] });
    for (let n = 0; n < 60; n++) expect((await search(request({ query: "Rio" }, "rate-limit-test"))).status).toBe(200);
    const response = await search(request({ query: "Rio" }, "rate-limit-test"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect((await response.json()).code).toBe("RATE_LIMIT");
    expect(searchDestinations).toHaveBeenCalledTimes(60);
  });

  it("sends a temporary no-store photo redirect without credentials", async () => {
    vi.mocked(getGooglePhotoUrl).mockResolvedValue("https://lh3.googleusercontent.com/image");
    const response = await photo(new Request("https://example.test/api/photo?name=places%2Fabc%2Fphotos%2Ftoken&width=600"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://lh3.googleusercontent.com/image");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("does not accept arbitrary photo URLs", async () => {
    const response = await photo(new Request("https://example.test/api/photo?name=https%3A%2F%2Finternal.example%2Fsecret&width=600"));
    expect(response.status).toBe(400);
    expect(getGooglePhotoUrl).not.toHaveBeenCalled();
  });
});
