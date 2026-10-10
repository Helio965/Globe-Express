import { z } from 'zod';
import { failure, guardRequest } from '@/lib/http';
import { googlePhotoUrl } from '@/services/google';
export const dynamic = 'force-dynamic';
const photoRequest = z.object({
  name: z.string().min(1).max(4700),
  width: z.coerce.number().int().min(1).max(4800).default(1600),
}).strict();
export async function GET(request: Request) {
  try {
    guardRequest(request, 'photos', 120);
    const input = photoRequest.parse(Object.fromEntries(new URL(request.url).searchParams));
    const url = await googlePhotoUrl(input.name, input.width, request.signal);
    return new Response(null, { status: 307, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return failure(error); }
}
