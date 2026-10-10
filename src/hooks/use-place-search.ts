'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiErrorBody, ApiSuccess, SearchSuggestion } from '@/types/explorer';

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface SearchState {
  query: string;
  suggestions: SearchSuggestion[];
  status: SearchStatus;
  error: string | null;
  sessionToken?: string;
  committed: boolean;
  retryAfter?: number;
}

const initialState: SearchState = {
  query: '', suggestions: [], status: 'idle', error: null, committed: false,
};

function makeSessionToken(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export default function usePlaceSearch(provider: 'google' | 'open') {
  const [state, setState] = useState<SearchState>(initialState);
  const [retryVersion, setRetryVersion] = useState(0);
  const requestVersion = useRef(0);

  const setQuery = useCallback((query: string) => {
    // Invalidate a pending response immediately, including during the debounce.
    requestVersion.current += 1;
    setState((previous) => ({
      query,
      suggestions: [],
      status: query.trim().length >= 2 ? 'loading' : 'idle',
      error: null,
      sessionToken: query.trim() ? previous.sessionToken ?? makeSessionToken() : undefined,
      committed: false,
    }));
  }, []);

  const finishSelection = useCallback((title: string) => {
    requestVersion.current += 1;
    setState({ query: title, suggestions: [], status: 'idle', error: null, committed: true });
  }, []);

  const abandonSearch = useCallback(() => {
    requestVersion.current += 1;
    setState((previous) => ({ ...previous, suggestions: [], status: 'idle', error: null, sessionToken: undefined, committed: true, retryAfter: undefined }));
  }, []);

  const retry = useCallback(() => {
    if (state.retryAfter || state.query.trim().length < 2) return;
    requestVersion.current += 1;
    setState((previous) => ({ ...previous, status: 'loading', error: null, suggestions: [], committed: false, sessionToken: previous.sessionToken ?? makeSessionToken() }));
    setRetryVersion((previous) => previous + 1);
  }, [state.query, state.retryAfter]);

  useEffect(() => {
    if (!state.retryAfter) return;
    const cooldown = window.setTimeout(() => setState((previous) => ({ ...previous, retryAfter: undefined })), state.retryAfter * 1000);
    return () => window.clearTimeout(cooldown);
  }, [state.retryAfter]);

  useEffect(() => {
    if (state.committed || state.query.trim().length < 2 || !state.sessionToken) return;
    const version = requestVersion.current;
    const controller = new AbortController();
    const debounce = window.setTimeout(async () => {
      const timeout = AbortSignal.timeout(15_000);
      const signal = AbortSignal.any([controller.signal, timeout]);
      try {
        const parameters = new URLSearchParams({ q: state.query.trim(), sessionToken: state.sessionToken! });
        const response = await fetch(`/api/search?${parameters}`, { signal });
        const body: ApiSuccess<SearchSuggestion[]> | ApiErrorBody = await response.json();
        if (controller.signal.aborted || version !== requestVersion.current) return;
        if (!response.ok || 'error' in body) {
          const message = 'error' in body ? body.error.message : 'A busca está indisponível. Tente novamente.';
          const retryAfter = 'error' in body && typeof body.error.retryAfter === 'number' && Number.isFinite(body.error.retryAfter) && body.error.retryAfter > 0 ? Math.ceil(body.error.retryAfter) : undefined;
          setState((previous) => ({ ...previous, suggestions: [], status: 'error', error: message, retryAfter }));
          return;
        }
        setState((previous) => ({ ...previous, suggestions: body.data, status: body.data.length ? 'ready' : 'empty', error: null }));
      } catch {
        if (controller.signal.aborted || version !== requestVersion.current) return;
        setState((previous) => ({ ...previous, suggestions: [], status: 'error', error: timeout.aborted ? 'A busca demorou para responder. Tente novamente.' : 'Não foi possível conectar à busca. Tente novamente.' }));
      }
    }, 300);
    return () => {
      window.clearTimeout(debounce);
      controller.abort();
    };
  }, [provider, state.query, state.sessionToken, state.committed, retryVersion]);

  return { ...state, setQuery, finishSelection, abandonSearch, retry };
}
