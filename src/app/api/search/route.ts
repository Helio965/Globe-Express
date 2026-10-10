import { searchRequestSchema } from '@/lib/validation';
import { failure, guardRequest, success } from '@/lib/http';
import { getExplorerConfig } from '@/lib/config';
import { googleSearch } from '@/services/google';
import { openSearch } from '@/services/open-provider';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardRequest(request, 'search', 40);
    const input = searchRequestSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return success(getExplorerConfig().googleConfigured
      ? await googleSearch(input.q, input.sessionToken, request.signal)
      : await openSearch(input.q, request.signal));
  } catch (error) { return failure(error); }
}
