'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ApiErrorBody, Coordinates, Destination, ExplorerConfig, Location, PlaceReference } from '@/types/explorer';
import { apiJson, ClientError } from '@/lib/client-api';
import { LatestRequest } from '@/lib/latest-request';
import { referenceKey } from '@/lib/format';
import { FAVORITES_KEY, RECENT_KEY, STORAGE_EVENT, parseSavedPlaces, rememberPlace, savePlaces, toggleSavedPlace } from '@/lib/saved-places';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(STORAGE_EVENT, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(STORAGE_EVENT, callback); };
}
function getStorage(key: string) { try { return window.localStorage.getItem(key) ?? '[]'; } catch { return '[]'; } }
const serverSnapshot = () => '[]';
const favoriteSnapshot = () => getStorage(FAVORITES_KEY);
const recentSnapshot = () => getStorage(RECENT_KEY);
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir a consulta.'; }

export function useExplorer() {
  const [config, setConfig] = useState<ExplorerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [mode, setMode] = useState<'map' | 'cinematic'>('map');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<'locating' | 'enriching' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useRef(new LatestRequest());
  const configRequests = useRef(new LatestRequest());
  const lastReference = useRef<PlaceReference | null>(null);
  const favoritesRaw = useSyncExternalStore(subscribe, favoriteSnapshot, serverSnapshot);
  const recentRaw = useSyncExternalStore(subscribe, recentSnapshot, serverSnapshot);
  const favorites = useMemo(() => parseSavedPlaces(favoritesRaw), [favoritesRaw]);
  const recent = useMemo(() => parseSavedPlaces(recentRaw), [recentRaw]);

  const write = useCallback((key: string, entries: PlaceReference[]) => {
    try {
      if (!savePlaces(window.localStorage, key, entries)) setNotice('O navegador não permitiu salvar este lugar. Verifique as permissões de armazenamento.');
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch { setNotice('O armazenamento local não está disponível neste navegador.'); }
  }, []);
  const retryConfig = useCallback(async () => {
    const current = configRequests.current.next();
    setConfigError(null);
    try {
      const next = await apiJson<ExplorerConfig>('/api/config', { signal: current.signal });
      if (current.isCurrent()) setConfig(next);
    } catch (issue) { if (current.isCurrent()) setConfigError(errorMessage(issue)); }
  }, []);
  useEffect(() => {
    // Resolve configuration asynchronously; initial state already represents loading.
    let active = true;
    queueMicrotask(() => { if (active) void retryConfig(); });
    const destinationRequests = requests.current, configurationRequests = configRequests.current;
    return () => { active = false; destinationRequests.cancel(); configurationRequests.cancel(); };
  }, [retryConfig]);

  const loadDestination = useCallback(async (reference: PlaceReference, sessionToken?: string) => {
    const current = requests.current.next();
    lastReference.current = reference;
    setLoading(true); setStage('locating'); setError(null);
    setDestination(null); setLocation(null);
    try {
      const response = await fetch('/api/destination', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({ reference, ...(sessionToken ? { sessionToken } : {}) }),
        signal: current.signal, cache: 'no-store',
      });
      if (!response.ok) {
        const issue = await response.json() as ApiErrorBody;
        throw new ClientError(issue.error.message, issue.error.code, issue.error.retryAfter);
      }
      let next: Destination | undefined;
      if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
        if (!response.body) throw new ClientError('Não foi possível receber o conteúdo do destino.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
            if (done && buffer.trim()) { lines.push(buffer); buffer = ''; }
            for (const line of lines) {
              if (!line.trim()) continue;
              const event = JSON.parse(line) as { type: 'location' | 'destination' | 'error'; location?: Location; data?: Destination; error?: { message: string; code: string } };
              if (!current.isCurrent()) return;
              if (event.type === 'error') throw new ClientError(event.error?.message ?? 'Falha ao explorar o destino.', event.error?.code);
              if (event.type === 'location' && event.location) { setLocation(event.location); setStage('enriching'); }
              if (event.type === 'destination') next = event.data;
            }
            if (done) break;
          }
        } finally { reader.releaseLock(); }
      } else { next = (await response.json() as { data: Destination }).data; }
      if (!next) throw new ClientError('O serviço não retornou os dados do destino. Tente novamente.');
      if (current.isCurrent()) {
        setDestination(next); setLocation(next.location);
        write(RECENT_KEY, rememberPlace(parseSavedPlaces(getStorage(RECENT_KEY)), next.location.reference));
      }
    } catch (issue) { if (current.isCurrent()) setError(errorMessage(issue)); }
    finally { if (current.isCurrent()) { setLoading(false); setStage(null); } }
  }, [write]);
  const selectCoordinates = useCallback((coordinates: Coordinates) => loadDestination({ provider: 'coordinates', ...coordinates }), [loadDestination]);
  const retry = useCallback(() => { if (lastReference.current) void loadDestination(lastReference.current); }, [loadDestination]);
  const openSaved = useCallback(async (reference: PlaceReference) => { setMode('cinematic'); await loadDestination(reference); }, [loadDestination]);
  const isFavorite = Boolean(location && favorites.some(item => referenceKey(item) === referenceKey(location.reference)));
  const toggleFavorite = useCallback(() => {
    if (location) write(FAVORITES_KEY, toggleSavedPlace(parseSavedPlaces(getStorage(FAVORITES_KEY)), location.reference));
  }, [location, write]);
  const clearRecent = useCallback(() => write(RECENT_KEY, []), [write]);
  const clearNotice = useCallback(() => setNotice(null), []);
  const clearError = useCallback(() => setError(null), []);
  return { config, configError, destination, location, mode, setMode, loading, stage, error, notice, clearNotice,
    loadDestination, selectCoordinates, retry, favorites, recent, toggleFavorite, isFavorite, openSaved, clearRecent, retryConfig, clearError };
}
