import type { ApiErrorBody, ApiSuccess } from '@/types/explorer';
export class ClientError extends Error {
  constructor(message: string, public code = 'REQUEST_ERROR', public retryAfter?: number) { super(message); }
}
export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body: unknown = await response.json();
  if (!response.ok) {
    const issue = body as Partial<ApiErrorBody>;
    throw new ClientError(issue.error?.message ?? 'Não foi possível concluir a consulta.', issue.error?.code, issue.error?.retryAfter);
  }
  return (body as ApiSuccess<T>).data;
}
