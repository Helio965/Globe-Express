import { destinationRequestSchema } from '@/lib/validation';
import { ApiError } from '@/lib/errors';
import { failure, guardRequest, success } from '@/lib/http';
import { completeDestination, resolveDestination } from '@/services/destination';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    guardRequest(request, 'destination', 20);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('INVALID_CONTENT_TYPE', 'Envie os dados em formato JSON.', 415);
    const body = await request.text();
    if (body.length > 12_000) throw new ApiError('INPUT_TOO_LARGE', 'Os dados enviados excederam o limite permitido.', 413);
    const input = destinationRequestSchema.parse(JSON.parse(body));
    if (!request.headers.get('accept')?.includes('application/x-ndjson')) {
      return success(await completeDestination(await resolveDestination(input.reference, input.sessionToken, request.signal), request.signal));
    }
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal, AbortSignal.timeout(45_000)]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => { if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
        try {
          const resolved = await resolveDestination(input.reference, input.sessionToken, signal);
          send({ type: 'location', location: resolved.location });
          const data = await completeDestination(resolved, signal);
          send({ type: 'destination', data });
        } catch (error) {
          const issue = error instanceof ApiError ? error : new ApiError('DESTINATION_FAILED', 'Não foi possível explorar este lugar. Tente novamente.', 502);
          if (!cancellation.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', error: { code: issue.code, message: issue.message } })}\n`));
        } finally { if (!cancellation.signal.aborted) controller.close(); }
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(stream, { headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return failure(error); }
}
