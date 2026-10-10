import type { PlaceRef } from "@/types/explorer";

export class RequestGate {
  private current?: AbortController;
  private sequence = 0;
  begin() {
    this.current?.abort();
    const controller = new AbortController();
    this.current = controller;
    const sequence = ++this.sequence;
    return { signal: controller.signal, isCurrent: () => sequence === this.sequence && !controller.signal.aborted };
  }
  cancel() { this.current?.abort(); this.sequence += 1; }
}

export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(35_000);
  try {
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível consultar este serviço. Tente novamente.");
    return data as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error("A consulta demorou demais. Tente novamente.");
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error("Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.");
    throw error;
  }
}

export function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function refKey(ref: PlaceRef) {
  if (ref.provider === "coordinates") return `coordinates:${ref.lat}:${ref.lng}`;
  return ref.provider === "wikipedia" ? `wikipedia:${ref.language}:${ref.id}` : `google:${ref.id}`;
}

// Only identifiers and user-selected coordinates are persisted, never provider content.
function normalizeRef(item: unknown): PlaceRef | undefined {
  if (!item || typeof item !== "object") return undefined;
  const ref = item as Record<string, unknown>;
  if (ref.provider === "google" && typeof ref.id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(ref.id)) return { provider: "google", id: ref.id };
  if (ref.provider === "wikipedia" && typeof ref.id === "string" && /^[1-9]\d{0,19}$/.test(ref.id) && (ref.language === "pt" || ref.language === "en")) return { provider: "wikipedia", id: ref.id, language: ref.language };
  if (ref.provider === "coordinates" && typeof ref.lat === "number" && Number.isFinite(ref.lat) && Math.abs(ref.lat) <= 90 && typeof ref.lng === "number" && Number.isFinite(ref.lng) && Math.abs(ref.lng) <= 180) return { provider: "coordinates", lat: ref.lat, lng: ref.lng };
  return undefined;
}

export function readRefs(storage: Pick<Storage, "getItem">, key: string): PlaceRef[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => { const ref = normalizeRef(item); return ref ? [ref] : []; }).slice(0, 30);
  } catch { return []; }
}

export function refLabel(ref: PlaceRef) {
  if (ref.provider === "coordinates") return `${ref.lat.toFixed(4)}°, ${ref.lng.toFixed(4)}°`;
  if (ref.provider === "wikipedia") return "Artigo geográfico salvo";
  return "Lugar salvo no Google Maps";
}

export function saveRefs(storage: Pick<Storage, "setItem">, key: string, refs: PlaceRef[]): boolean {
  const clean = refs.flatMap(item => { const ref = normalizeRef(item); return ref ? [ref] : []; }).slice(0, 30);
  try { storage.setItem(key, JSON.stringify(clean)); return true; } catch { return false; }
}

export function toggleRef(refs: PlaceRef[], ref: PlaceRef): PlaceRef[] {
  return refs.some(item => refKey(item) === refKey(ref)) ? refs.filter(item => refKey(item) !== refKey(ref)) : [ref, ...refs].slice(0, 30);
}
