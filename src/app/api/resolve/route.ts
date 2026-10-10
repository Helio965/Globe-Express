import { checkRateLimit, errorResponse, jsonResponse } from "@/lib/server/api";
import { destinationSchema, readJson } from "@/lib/server/validation";
import { resolvePlace } from "@/services/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    checkRateLimit(request, "resolve", 60);
    const { ref, sessionToken } = await readJson(request, destinationSchema);
    return jsonResponse(await resolvePlace(ref, sessionToken, request.signal));
  } catch (error) { return errorResponse(error); }
}
