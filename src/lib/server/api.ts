import { createHash } from "node:crypto";
import { ServiceError } from "./http";

const windowMs = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();
export const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

/** A bounded, per-process guard. Production replicas need a shared gateway limit. */
export function checkRateLimit(request: Request, scope: string, limit = 60): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  // Deploy behind a trusted proxy that replaces forwarded client-IP headers.
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip") ?? "local";
  const key = createHash("sha256").update(`${scope}:${client.slice(0, 100)}`).digest("hex");
  const existing = buckets.get(key);
  if (!existing && buckets.size >= 10_000) {
    throw new ServiceError("RATE_LIMIT", "Muitas consultas. Aguarde um minuto para continuar.", 429);
  }
  const bucket = existing ?? { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) throw new ServiceError("RATE_LIMIT", "Muitas consultas. Aguarde um minuto para continuar.", 429);
}

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: privateHeaders });
}

export function errorResponse(error: unknown): Response {
  const wikiStatus = error instanceof Error && error.name === "WikimediaError" && "status" in error ? error.status : undefined;
  const safe = error instanceof ServiceError
    ? error
    : wikiStatus === 404
      ? new ServiceError("NOT_FOUND", "Este lugar não foi encontrado na Wikipédia.", 404)
    : wikiStatus === 400
      ? new ServiceError("INVALID_INPUT", "A referência do lugar é inválida.", 400)
    : wikiStatus === 429
      ? new ServiceError("PROVIDER_QUOTA", "A Wikipédia atingiu seu limite de consultas. Tente novamente em instantes.", 503)
    : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? new ServiceError("TIMEOUT", "A consulta demorou demais ou foi cancelada. Tente novamente.", 504)
    : new ServiceError("UNAVAILABLE", "Não foi possível carregar os dados agora. Tente novamente.", 503);
  return Response.json({ error: safe.publicMessage, code: safe.code, ...(safe.status === 429 ? { retryAfter: 60 } : {}) }, {
    status: safe.status,
    headers: { ...privateHeaders, ...(safe.status === 429 ? { "Retry-After": "60" } : {}) },
  });
}
