import { checkRateLimit, errorResponse, jsonResponse } from "@/lib/server/api";
import { readJson, searchSchema } from "@/lib/server/validation";
import { searchDestinations } from "@/services/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    checkRateLimit(request, "search", 60);
    const { query, sessionToken } = await readJson(request, searchSchema);
    return jsonResponse(await searchDestinations(query, sessionToken, request.signal));
  } catch (error) { return errorResponse(error); }
}
