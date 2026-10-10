import { checkRateLimit, errorResponse } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/http";
import { mediaQuerySchema, optimizeCommonsImage } from "@/services/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    checkRateLimit(request, "commons-media", 120);
    const query = mediaQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new ServiceError("INVALID_INPUT", "Referência de fotografia inválida.", 400);
    const data = await optimizeCommonsImage(query.data.url, query.data.width, request.signal);
    return new Response(data, { headers: { "Content-Type": "image/webp", "Content-Length": String(data.byteLength), "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
