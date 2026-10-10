import sharp from "sharp";
import { z } from "zod";
import { deadline, ServiceError } from "@/lib/server/http";

const maxBytes = 12 * 1024 * 1024;
const timeoutMs = 15_000;
const maxActive = 2;
const maxQueued = 12;
let active = 0;
type SlotWaiter = { signal: AbortSignal; resolve: (release: () => void) => void; reject: (reason: unknown) => void; onAbort: () => void };
const queue: SlotWaiter[] = [];

function releaseSlot(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active -= 1;
    while (active < maxActive && queue.length) {
      const waiter = queue.shift()!;
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) { waiter.reject(waiter.signal.reason); continue; }
      active += 1;
      waiter.resolve(releaseSlot());
    }
  };
}

async function acquireSlot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (active < maxActive) { active += 1; return releaseSlot(); }
  if (queue.length >= maxQueued) throw new ServiceError("MEDIA_BUSY", "O serviço de fotografias está ocupado. Tente novamente em instantes.", 503);
  return new Promise((resolve, reject) => {
    const waiter: SlotWaiter = {
      signal, resolve, reject,
      onAbort: () => {
        const index = queue.indexOf(waiter);
        if (index >= 0) queue.splice(index, 1);
        signal.removeEventListener("abort", waiter.onAbort);
        reject(signal.reason);
      },
    };
    queue.push(waiter);
    signal.addEventListener("abort", waiter.onAbort, { once: true });
  });
}

const hosts = new Set(["upload.wikimedia.org", "thumb.wikimedia.org"]);
export const commonsImageSchema = z.string().max(4096).transform((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && hosts.has(url.hostname) && !url.username && !url.password && !url.port && !url.hash && url.pathname.startsWith("/wikipedia/commons/") && !/%(?:2f|5c)/i.test(url.pathname)) return url;
  } catch { /* Invalid URLs are rejected without logging the supplied value. */ }
  context.addIssue({ code: "custom", message: "URL de fotografia inválida." });
  return z.NEVER;
});
export const mediaQuerySchema = z.object({ url: commonsImageSchema, width: z.coerce.number().int().min(64).max(3840) }).strict();

async function photograph(url: URL, signal: AbortSignal): Promise<Buffer> {
  let current = url;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const response = await fetch(current, { signal, redirect: "manual", cache: "no-store", headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "GlobeExpress/1.0 (https://github.com/Helio965/Globe-Express)" } });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      const allowed = location ? commonsImageSchema.safeParse(new URL(location, current).href) : undefined;
      if (allowed?.success && redirects < 2) { current = allowed.data; continue; }
      throw new ServiceError("INVALID_IMAGE", "A fonte da fotografia não está disponível.", 502);
    }
    if (!response.ok || !/^image\/(?:jpeg|png|webp)(?:;|$)/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      throw new ServiceError("IMAGE_UNAVAILABLE", "Não foi possível carregar esta fotografia.", 502);
    }
    if (Number(response.headers.get("content-length")) > maxBytes || !response.body) {
      await response.body?.cancel();
      throw new ServiceError("IMAGE_TOO_LARGE", "Esta fotografia excede o limite de processamento.", 413);
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new ServiceError("IMAGE_TOO_LARGE", "Esta fotografia excede o limite de processamento.", 413); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks);
  }
  throw new ServiceError("IMAGE_UNAVAILABLE", "A fotografia não pôde ser carregada.", 502);
}

/** Only licensed Commons raster images use this optimizer; Google photos stay uncached. */
export async function optimizeCommonsImage(url: URL, width: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const verified = commonsImageSchema.parse(url.href);
  const expiresAt = Date.now() + timeoutMs;
  const bounded = deadline(signal, timeoutMs);
  let release: (() => void) | undefined;
  try {
    release = await acquireSlot(bounded);
    bounded.throwIfAborted();
    const input = await photograph(verified, bounded);
    bounded.throwIfAborted();
    const seconds = Math.max(1, Math.min(15, Math.floor((expiresAt - Date.now()) / 1000)));
    const output = await sharp(input, { limitInputPixels: 80_000_000, animated: false }).timeout({ seconds }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    bounded.throwIfAborted();
    return new Uint8Array(output);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (bounded.aborted || (error instanceof Error && /\btimeout\b|timed out/i.test(error.message))) throw new ServiceError("TIMEOUT", "A fotografia demorou demais para carregar ou processar.", 504);
    throw new ServiceError("IMAGE_UNAVAILABLE", "Não foi possível processar esta fotografia.", 502);
  } finally { release?.(); }
}
