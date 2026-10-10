export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly status = 502,
  ) {
    super(publicMessage);
    this.name = "ServiceError";
  }
}

export function deadline(signal?: AbortSignal, timeoutMs = 8_000): AbortSignal {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
}

/** No upstream response bodies or URLs enter errors: either may contain credentials. */
export async function fetchJson<T>(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = 8_000,
): Promise<T> {
  const signal = deadline(init.signal ?? undefined, timeoutMs);
  try {
    signal.throwIfAborted();
    const response = await fetch(url, { redirect: "error", ...init, cache: "no-store", signal });
    if (!response.ok) {
      if (response.status === 429) {
        throw new ServiceError("PROVIDER_QUOTA", "O serviço atingiu seu limite de consultas. Tente novamente em instantes.", 503);
      }
      if (response.status === 401 || response.status === 403) {
        throw new ServiceError("PROVIDER_AUTH", "O serviço de mapas não está disponível com a configuração atual.", 503);
      }
      if (response.status === 404) {
        throw new ServiceError("NOT_FOUND", "Este lugar ou imagem não foi encontrado.", 404);
      }
      throw new ServiceError("PROVIDER_ERROR", "Não foi possível consultar o serviço de mapas agora.");
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (signal.aborted) {
      throw new ServiceError("TIMEOUT", "A consulta demorou demais ou foi cancelada. Tente novamente.", 504);
    }
    throw new ServiceError("NETWORK_ERROR", "Não foi possível conectar ao serviço de dados.", 502);
  }
}
