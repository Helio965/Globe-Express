import { z } from "zod";
import { ServiceError } from "./http";

export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

export const sessionTokenSchema = z.string().uuid();
export const placeRefSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("google"), id: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/) }).strict(),
  z.object({ provider: z.literal("wikipedia"), id: z.string().regex(/^[1-9]\d{0,19}$/), language: z.enum(["pt", "en"]) }).strict(),
  coordinatesSchema.extend({ provider: z.literal("coordinates") }).strict(),
]);
export const searchSchema = z.object({
  query: z.string().trim().min(2).max(200),
  sessionToken: sessionTokenSchema.optional(),
}).strict();
export const destinationSchema = z.object({ ref: placeRefSchema, sessionToken: sessionTokenSchema.optional() }).strict();
export const photoNameSchema = z.string().max(4_096).regex(/^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]+$/);
export const photoQuerySchema = z.object({
  name: photoNameSchema,
  width: z.coerce.number().int().min(100).max(2_000).default(1_200),
}).strict();

export async function readJson<T>(request: Request, schema: z.ZodType<T>, timeoutMs = 8_000): Promise<T> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > 8_192) throw new ServiceError("BODY_TOO_LARGE", "A solicitação é muito grande.", 413);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ServiceError("INVALID_CONTENT_TYPE", "Envie a solicitação como JSON.", 415);
  }
  // Read in bounded chunks so a chunked request cannot allocate an unbounded body.
  const reader = request.body?.getReader();
  if (!reader) throw new ServiceError("INVALID_INPUT", "A solicitação está vazia.", 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  const cancelRead = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancelRead, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8_192) {
        cancelRead();
        throw new ServiceError("BODY_TOO_LARGE", "A solicitação é muito grande.", 413);
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return schema.parse(JSON.parse(new TextDecoder().decode(body)));
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (signal.aborted) throw new ServiceError("REQUEST_TIMEOUT", "O envio da solicitação demorou demais ou foi cancelado.", 408);
    throw new ServiceError("INVALID_INPUT", "Confira os dados enviados e tente novamente.", 400);
  } finally {
    signal.removeEventListener("abort", cancelRead);
    if (signal.aborted) cancelRead();
    reader.releaseLock();
  }
}
