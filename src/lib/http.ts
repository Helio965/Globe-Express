import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiError } from './errors';

export function success<T>(data: T) {
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function failure(error: unknown) {
  const issue = error instanceof ApiError ? error : error instanceof ZodError || error instanceof SyntaxError
    ? new ApiError('INVALID_INPUT', 'Verifique os dados enviados: a localização ou a consulta é inválida.', 400)
    : new ApiError('INTERNAL_ERROR', 'Não foi possível concluir esta consulta. Tente novamente.', 500);
  return NextResponse.json({ error: { code: issue.code, message: issue.message, ...(issue.retryAfter ? { retryAfter: issue.retryAfter } : {}) } }, {
    status: issue.status === 499 ? 408 : issue.status,
    headers: { 'Cache-Control': 'no-store', ...(issue.retryAfter ? { 'Retry-After': String(issue.retryAfter) } : {}) },
  });
}

const buckets = new Map<string, { start: number; count: number }>();
export function guardRequest(request: Request, group: string, limit = 60): void {
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  // Next may construct request.url from its bind address (0.0.0.0), rather
  // than the browser-visible host. Compare the actual Host header, honoring
  // the protocol supplied by a trusted reverse proxy for HTTPS deployments.
  const host = request.headers.get('host') ?? requestUrl.host;
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? requestUrl.protocol.replace(':', '');
  const requestOrigin = `${protocol}://${host}`;
  if (origin && origin !== requestOrigin) throw new ApiError('ORIGIN_REJECTED', 'Esta consulta deve ser feita pelo próprio aplicativo.', 403);
  // The deployment proxy must replace forwarded headers. This is a per-instance
  // guard, not a substitute for production edge rate limits or provider quotas.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const key = `${group}:${ip.slice(0, 100)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= 60_000) {
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start > 60_000) buckets.delete(k);
      if (buckets.size > 5000) throw new ApiError('RATE_LIMIT', 'Muitas consultas. Aguarde um minuto.', 429, 60);
    }
    buckets.set(key, { start: now, count: 1 });
    return;
  }
  if (bucket.count >= limit) throw new ApiError('RATE_LIMIT', 'Muitas consultas. Aguarde um minuto.', 429, Math.ceil((60_000 - (now - bucket.start)) / 1000));
  bucket.count++;
}
