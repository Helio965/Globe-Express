import { checkRateLimit, errorResponse, privateHeaders } from "@/lib/server/api";
import { ServiceError } from "@/lib/server/http";
import { photoQuerySchema } from "@/lib/server/validation";
import { getGooglePhotoUrl } from "@/services/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    checkRateLimit(request, "photo", 120);
    const parsed = photoQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ServiceError("INVALID_INPUT", "Referência de imagem inválida.", 400);
    const url = await getGooglePhotoUrl(parsed.data.name, parsed.data.width, request.signal);
    return new Response(null, { status: 307, headers: { ...privateHeaders, Location: url, "Referrer-Policy": "no-referrer" } });
  } catch (error) { return errorResponse(error); }
}
