import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { commonsImageSchema, optimizeCommonsImage } from "./media";

const url = new URL("https://upload.wikimedia.org/wikipedia/commons/a/a1/photo.jpg");
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function smallRaster() {
  return sharp({ create: { width: 24, height: 12, channels: 3, background: "#345451" } }).png().toBuffer();
}

function imageResponse(input: Buffer) {
  return new Response(new Uint8Array(input), { headers: { "Content-Type": "image/png" } });
}

function deferredFetch() {
  const downloads: { resolve: (response: Response) => void }[] = [];
  const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const abort = () => reject(init?.signal?.reason);
    init?.signal?.addEventListener("abort", abort, { once: true });
    downloads.push({ resolve: response => { init?.signal?.removeEventListener("abort", abort); resolve(response); } });
  }));
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, downloads };
}

describe("verified Commons image processing", () => {
  it("rejects foreign hosts, ports, credentials, non-HTTPS and unexpected paths", () => {
    for (const value of ["http://upload.wikimedia.org/wikipedia/commons/a.jpg", "https://127.0.0.1/wikipedia/commons/a.jpg", "https://upload.wikimedia.org.evil.test/wikipedia/commons/a.jpg", "https://upload.wikimedia.org:8443/wikipedia/commons/a.jpg", "https://user:password@upload.wikimedia.org/wikipedia/commons/a.jpg", "https://upload.wikimedia.org/private/a.jpg", "https://upload.wikimedia.org/wikipedia/commons/a%2Fb.jpg"])
      expect(commonsImageSchema.safeParse(value).success).toBe(false);
    expect(commonsImageSchema.safeParse(url.href).success).toBe(true);
  });

  it("resizes a real raster buffer and emits a valid WebP, preserving TLS verification", async () => {
    const input = await sharp({ create: { width: 24, height: 12, channels: 3, background: "#345451" } }).png().toBuffer();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(input), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const output = await optimizeCommonsImage(url, 12);
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 12, height: 6 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual", cache: "no-store" });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("rejectUnauthorized");
  });

  it("refuses a redirect to an unexpected destination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://internal.example/private" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(optimizeCommonsImage(url, 800)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-image and oversized upstream content before processing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("HTML", { headers: { "Content-Type": "text/html" } })));
    await expect(optimizeCommonsImage(url, 800)).rejects.toMatchObject({ code: "IMAGE_UNAVAILABLE" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oversized", { headers: { "Content-Type": "image/jpeg", "Content-Length": String(13 * 1024 * 1024) } })));
    await expect(optimizeCommonsImage(url, 800)).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });

  it("keeps only two image downloads and transformations in flight", async () => {
    const input = await smallRaster();
    const { fetchMock, downloads } = deferredFetch();
    const pending = Array.from({ length: 4 }, () => optimizeCommonsImage(url, 12));
    const completion = Promise.all(pending);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    downloads[0].resolve(imageResponse(input));
    await pending[0];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    // The queued third download enters only after the first complete transform releases its slot.
    downloads[1].resolve(imageResponse(input));
    await pending[1];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    downloads[2].resolve(imageResponse(input));
    downloads[3].resolve(imageResponse(input));
    const output = await completion;
    expect(await sharp(output[3]).metadata()).toMatchObject({ format: "webp", width: 12 });
  });

  it("bounds the waiting queue and frees its capacity and active slots on cancellation", async () => {
    const { fetchMock } = deferredFetch();
    const controllers = Array.from({ length: 14 }, () => new AbortController());
    const pending = controllers.map(controller => optimizeCommonsImage(url, 12, controller.signal));
    const completion = Promise.allSettled(pending);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expect(optimizeCommonsImage(url, 12)).rejects.toMatchObject({ code: "MEDIA_BUSY", status: 503 });
    controllers[2].abort();
    await expect(pending[2]).rejects.toMatchObject({ code: "TIMEOUT" });
    const replacementController = new AbortController();
    const replacement = optimizeCommonsImage(url, 12, replacementController.signal);
    const replacementCompletion = Promise.allSettled([replacement]);
    // A replacement fits the canceled queue entry; another request still exceeds the queue.
    await expect(optimizeCommonsImage(url, 12)).rejects.toMatchObject({ code: "MEDIA_BUSY" });
    for (const controller of controllers) controller.abort();
    replacementController.abort();
    expect((await completion).every(result => result.status === "rejected")).toBe(true);
    expect((await replacementCompletion)[0].status).toBe("rejected");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const input = await smallRaster();
    fetchMock.mockImplementation(() => Promise.resolve(imageResponse(input)));
    // Excess and canceled requests cannot leak permits into subsequent real transformations.
    const recovered = await Promise.all([optimizeCommonsImage(url, 12), optimizeCommonsImage(url, 12)]);
    expect(recovered).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("expires a queued request before it downloads and returns its waiting capacity", async () => {
    const timeouts: AbortController[] = [];
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      timeouts.push(controller);
      return controller.signal;
    });
    const { fetchMock } = deferredFetch();
    const activeControllers = [new AbortController(), new AbortController()];
    const pending = activeControllers.map(controller => optimizeCommonsImage(url, 12, controller.signal));
    const completion = Promise.allSettled(pending);
    const queued = optimizeCommonsImage(url, 12);
    const queuedCompletion = Promise.allSettled([queued]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(timeoutSpy).toHaveBeenNthCalledWith(3, 15_000);
    timeouts[2].abort(new DOMException("Queue deadline", "TimeoutError"));
    await expect(queued).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    await queuedCompletion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const controller of activeControllers) controller.abort();
    await completion;
  });

  it("passes the remaining deadline to Sharp and reports native processing timeouts", async () => {
    const input = await smallRaster();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(imageResponse(input))));
    const timeoutSpy = vi.spyOn(sharp.prototype, "timeout");
    vi.spyOn(Date, "now").mockReturnValueOnce(100_000).mockReturnValueOnce(112_000);
    await optimizeCommonsImage(url, 12);
    expect(timeoutSpy).toHaveBeenCalledWith({ seconds: 3 });
    vi.spyOn(sharp.prototype, "toBuffer").mockRejectedValueOnce(new Error("timeout: 25% complete"));
    await expect(optimizeCommonsImage(url, 12)).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
    // A native processing failure releases its permit as well.
    await expect(optimizeCommonsImage(url, 12)).resolves.toBeInstanceOf(Uint8Array);
  });
});
