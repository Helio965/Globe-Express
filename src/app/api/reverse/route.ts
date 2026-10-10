import { checkRateLimit, errorResponse, jsonResponse } from "@/lib/server/api";
import { coordinatesSchema, readJson } from "@/lib/server/validation";
import { reverseLocation } from "@/services/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    checkRateLimit(request, "reverse", 45);
    const coordinates = await readJson(request, coordinatesSchema);
    return jsonResponse(await reverseLocation(coordinates, request.signal));
  } catch (error) { return errorResponse(error); }
}
