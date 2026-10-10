import { EnvHttpProxyAgent, fetch as proxyFetch } from 'undici';
import { ApiError } from './errors';

// Use the cloud platform's supported HTTPS proxy and default CA verification.
const dispatcher = new EnvHttpProxyAgent();
const permittedHosts = new Set([
  'pt.wikipedia.org', 'en.wikipedia.org', 'www.wikidata.org',
  'commons.wikimedia.org', 'places.googleapis.com', 'maps.googleapis.com',
]);
const agent = 'WorldExplorer/1.0 (https://github.com/Helio965/Globe-Express; geographic exploration)';

export async function upstreamJson(
  input: string | URL,
  options: { signal?: AbortSignal; init?: RequestInit } = {},
): Promise<unknown> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !permittedHosts.has(url.hostname) || url.username || url.password) {
    throw new ApiError('UNSAFE_UPSTREAM', 'Destino de serviço externo não permitido.', 400);
  }
  const headers = new Headers(options.init?.headers);
  headers.set('User-Agent', agent);
  headers.set('Accept', 'application/json');
  const signals = [AbortSignal.timeout(12_000), options.signal, options.init?.signal].filter(
    (signal): signal is AbortSignal => Boolean(signal),
  );
  try {
    const response = await proxyFetch(url, {
      dispatcher,
      method: options.init?.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      body: typeof options.init?.body === 'string' ? options.init.body : undefined,
      signal: AbortSignal.any(signals),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after'));
        throw new ApiError('UPSTREAM_RATE_LIMIT', 'O serviço atingiu o limite de consultas. Aguarde e tente novamente.', 429, Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) : 30);
      }
      if (response.status === 401 || response.status === 403) {
        throw new ApiError('UPSTREAM_ACCESS', 'O serviço recusou o acesso. Verifique a configuração de rede e as credenciais.', 503);
      }
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Um serviço de dados está indisponível. Tente novamente em instantes.', 502);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      await response.body?.cancel();
      throw new ApiError('UPSTREAM_RESPONSE', 'O serviço retornou uma resposta inesperada.', 502);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > 8_000_000) {
      await response.body?.cancel();
      throw new ApiError('UPSTREAM_RESPONSE', 'A resposta do serviço excedeu o limite permitido.', 502);
    }
    const text = await response.text();
    if (text.length > 8_000_000) throw new ApiError('UPSTREAM_RESPONSE', 'A resposta do serviço excedeu o limite permitido.', 502);
    try { return JSON.parse(text) as unknown; }
    catch { throw new ApiError('UPSTREAM_RESPONSE', 'O serviço retornou dados inválidos.', 502); }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted || options.init?.signal?.aborted) throw new ApiError('REQUEST_ABORTED', 'Consulta cancelada.', 499);
    throw new ApiError('UPSTREAM_CONNECTION', 'Não foi possível conectar ao serviço. Verifique a conexão ou tente novamente.', 503);
  }
}
