import { reverseRequestSchema } from '@/lib/validation';
import { failure, guardRequest, success } from '@/lib/http';
import { resolveDestination } from '@/services/destination';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardRequest(request, 'destination', 20);
    const point = reverseRequestSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return success((await resolveDestination({ provider: 'coordinates', ...point }, undefined, request.signal)).location);
  } catch (error) { return failure(error); }
}
