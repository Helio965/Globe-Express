'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, LoaderCircle, RotateCcw } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import type { Coordinates, Location, PlaceReference } from '@/types/explorer';
import { GOOGLE_MAPS_AUTH_FAILURE, GoogleMapError, loadGoogleMaps } from './google-loader';

interface MapCanvasProps {
  provider: 'google' | 'open';
  location: Location | null;
  onSelectCoordinates: (coordinates: Coordinates) => void;
  onSelectPlace: (reference: PlaceReference) => void;
  visible: boolean;
}

type MapHandle =
  | { provider: 'google'; map: google.maps.Map; marker: google.maps.Circle | null; selectionKey?: string }
  | { provider: 'open'; map: Leaflet.Map; marker: Leaflet.CircleMarker | null; tiles: Leaflet.TileLayer; library: typeof Leaflet; selectionKey?: string };

interface MapState {
  kind: 'loading' | 'ready' | 'error';
  provider: 'google' | 'open';
  attempt: number;
  message?: string;
  authenticationError?: boolean;
  tileWarning?: string;
}

const INITIAL_VIEWPORT = { coordinates: { lat: 18, lng: -22 }, zoom: 2 };

function normalizeCoordinates(lat: number, lng: number): Coordinates {
  return { lat: Math.max(-90, Math.min(90, lat)), lng: ((lng + 180) % 360 + 360) % 360 - 180 };
}

function selectionKey(location: Location): string {
  const reference = location.reference;
  const identifier = 'id' in reference ? `${reference.provider}:${reference.id}` : `${reference.lat}:${reference.lng}`;
  return `${identifier}|${location.coordinates.lat.toFixed(6)}:${location.coordinates.lng.toFixed(6)}`;
}

function selectionZoom(location: Location, previousZoom: number): number {
  const kind = location.kind.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(country|pais|nation|nacao|estado soberano)\b|^sovereign (state|country)\b/.test(kind)) return 4;
  if (/^(region|regiao|state|province|provincia|estado|continent|continente)\b/.test(kind)) return 7;
  if (/^(city|cidade|town|municipio|municipality|capital|comuna)\b/.test(kind)) return 11;
  if (location.reference.provider === 'coordinates') return previousZoom >= 8 ? previousZoom : 11;
  if (/\b(natural|park|parque|mountain|montanha|island|ilha)\b/.test(kind)) return 12;
  return 13;
}

function circleRadius(latitude: number, zoom: number): number {
  return 8 * 156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom);
}

export default function MapCanvas({ provider, location, onSelectCoordinates, onSelectPlace, visible }: MapCanvasProps) {
  const surface = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const viewport = useRef(INITIAL_VIEWPORT);
  const callbacks = useRef({ onSelectCoordinates, onSelectPlace });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MapState>({ kind: 'loading', provider, attempt: 0 });
  const currentState = state.provider === provider && state.attempt === attempt ? state : { kind: 'loading' as const, provider, attempt };

  useEffect(() => {
    callbacks.current = { onSelectCoordinates, onSelectPlace };
  }, [onSelectCoordinates, onSelectPlace]);

  useEffect(() => {
    let disposed = false;
    const element = surface.current;
    if (!element) return;

    const authenticationFailure = () => {
      if (!disposed && provider === 'google') {
        setState({ kind: 'error', provider, attempt, authenticationError: true, message: 'Google Maps indisponível. A chave de acesso precisa ser verificada.' });
      }
    };
    if (provider === 'google') window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE, authenticationFailure);

    async function initialize() {
      try {
        const initial = viewport.current;
        if (provider === 'google') {
          const maps = await loadGoogleMaps();
          if (disposed) return;
          const map = new maps.Map(element!, {
            center: initial.coordinates,
            zoom: initial.zoom,
            mapTypeId: maps.MapTypeId.ROADMAP,
            mapTypeControl: true,
            mapTypeControlOptions: { mapTypeIds: [maps.MapTypeId.ROADMAP, maps.MapTypeId.SATELLITE, maps.MapTypeId.TERRAIN], position: maps.ControlPosition.TOP_RIGHT, style: maps.MapTypeControlStyle.DROPDOWN_MENU },
            fullscreenControl: false,
            streetViewControl: false,
            zoomControl: true,
            zoomControlOptions: { position: maps.ControlPosition.RIGHT_CENTER },
            clickableIcons: true,
            gestureHandling: 'greedy',
          });
          handle.current = { provider: 'google', map, marker: null };
          map.addListener('click', (event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
            if ('placeId' in event && event.placeId) {
              event.stop();
              callbacks.current.onSelectPlace({ provider: 'google', id: event.placeId });
            } else if (event.latLng) {
              callbacks.current.onSelectCoordinates(normalizeCoordinates(event.latLng.lat(), event.latLng.lng()));
            }
          });
          map.addListener('idle', () => {
            const center = map.getCenter();
            if (center) viewport.current = { coordinates: { lat: center.lat(), lng: center.lng() }, zoom: map.getZoom() ?? initial.zoom };
          });
          map.addListener('zoom_changed', () => {
            const instance = handle.current;
            if (instance?.provider !== 'google' || instance.map !== map) return;
            const center = instance.marker?.getCenter();
            if (center) instance.marker?.setRadius(circleRadius(center.lat(), map.getZoom() ?? initial.zoom));
          });
          setState({ kind: 'ready', provider, attempt });
        } else {
          const library = await import('leaflet');
          if (disposed) return;
          const map = library.map(element!, { center: [initial.coordinates.lat, initial.coordinates.lng], zoom: initial.zoom, minZoom: 2, maxZoom: 19, preferCanvas: true, zoomControl: true, attributionControl: true });
          const tiles = library.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' });
          let failedTiles = 0;
          tiles.on('loading', () => { failedTiles = 0; });
          tiles.on('tileerror', () => {
            failedTiles += 1;
            if (!disposed) setState({ kind: 'ready', provider, attempt, tileWarning: 'Algumas áreas do mapa não carregaram. Verifique a conexão e tente novamente.' });
          });
          tiles.on('load', () => {
            if (!disposed && failedTiles === 0) setState({ kind: 'ready', provider, attempt });
          });
          tiles.addTo(map);
          handle.current = { provider: 'open', map, marker: null, tiles, library };
          map.on('click', (event: Leaflet.LeafletMouseEvent) => {
            callbacks.current.onSelectCoordinates(normalizeCoordinates(event.latlng.lat, event.latlng.lng));
          });
          const saveViewport = () => {
            const center = map.getCenter();
            viewport.current = { coordinates: { lat: center.lat, lng: center.lng }, zoom: map.getZoom() };
          };
          map.on('moveend zoomend', saveViewport);
          setState({ kind: 'ready', provider, attempt });
        }
      } catch (error) {
        if (!disposed) setState({ kind: 'error', provider, attempt, message: error instanceof Error ? error.message : 'Não foi possível carregar o mapa. Tente novamente.', authenticationError: error instanceof GoogleMapError && error.reason === 'authentication' });
      }
    }
    void initialize();

    return () => {
      disposed = true;
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE, authenticationFailure);
      const instance = handle.current;
      if (instance?.provider === 'open') {
        const center = instance.map.getCenter();
        viewport.current = { coordinates: { lat: center.lat, lng: center.lng }, zoom: instance.map.getZoom() };
        instance.map.remove();
      } else if (instance?.provider === 'google') {
        const center = instance.map.getCenter();
        if (center) viewport.current = { coordinates: { lat: center.lat(), lng: center.lng() }, zoom: instance.map.getZoom() ?? 2 };
        instance.marker?.setMap(null);
        google.maps.event.clearInstanceListeners(instance.map);
        element.replaceChildren();
      }
      handle.current = null;
    };
  }, [provider, attempt]);

  useEffect(() => {
    const instance = handle.current;
    if (!location || !instance || state.kind !== 'ready' || state.provider !== provider || state.attempt !== attempt) return;
    const { lat, lng } = location.coordinates;
    const key = selectionKey(location);
    const shouldRecenter = instance.selectionKey !== key;
    instance.selectionKey = key;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instance.provider === 'google') {
      if (!instance.marker) instance.marker = new google.maps.Circle({ map: instance.map, clickable: false, fillColor: '#f97346', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3, zIndex: 20 });
      instance.marker.setCenter({ lat, lng });
      if (shouldRecenter) {
        const zoom = selectionZoom(location, instance.map.getZoom() ?? 2);
        instance.map.setZoom(zoom);
        if (reducedMotion) instance.map.setCenter({ lat, lng });
        else instance.map.panTo({ lat, lng });
      }
      instance.marker.setRadius(circleRadius(lat, instance.map.getZoom() ?? 2));
    } else {
      if (!instance.marker) instance.marker = instance.library.circleMarker([lat, lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: '#f97346', fillOpacity: 1 }).addTo(instance.map);
      instance.marker.setLatLng([lat, lng]);
      const label = document.createElement('span');
      label.textContent = location.name;
      instance.marker.bindTooltip(label, { direction: 'top', offset: [0, -8] });
      if (shouldRecenter) instance.map.flyTo([lat, lng], selectionZoom(location, instance.map.getZoom()), { animate: !reducedMotion, duration: 1.15 });
    }
  }, [location, provider, attempt, state.kind, state.provider, state.attempt]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      const instance = handle.current;
      if (instance?.provider === 'open') instance.map.invalidateSize({ pan: false });
      else if (instance?.provider === 'google') {
        const center = instance.map.getCenter();
        google.maps.event.trigger(instance.map, 'resize');
        if (center) instance.map.setCenter(center);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible, state.kind, state.provider, state.attempt]);

  function retry() {
    if (currentState.authenticationError) {
      window.location.reload();
      return;
    }
    setAttempt((previous) => previous + 1);
  }

  return (
    <div className="map-canvas" data-provider={provider}>
      <div className="map-surface" ref={surface} role="region" aria-label={`${provider === 'google' ? 'Mapa interativo do Google Maps' : 'Mapa interativo do OpenStreetMap'}${location ? `: ${location.name}` : ''}`} />
      {currentState.kind === 'loading' && (
        <div className="map-status" role="status"><LoaderCircle className="map-spinner" size={24} aria-hidden="true" /><span>Carregando o mundo…</span></div>
      )}
      {currentState.kind === 'error' && (
        <div className="map-status map-status-error" role="alert">
          <AlertCircle size={26} aria-hidden="true" />
          <p>{currentState.message}</p>
          <button className="map-retry" type="button" onClick={retry}><RotateCcw size={15} aria-hidden="true" />Tentar novamente</button>
        </div>
      )}
      {currentState.tileWarning && (
        <div className="map-tile-warning" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{currentState.tileWarning}</span><button className="map-retry" type="button" onClick={() => handle.current?.provider === 'open' && handle.current.tiles.redraw()} aria-label="Tentar carregar os blocos do mapa novamente"><RotateCcw size={15} aria-hidden="true" /></button></div>
      )}
      {provider === 'open' && currentState.kind === 'ready' && <div className="map-provider-note"><span>OpenStreetMap · vista tradicional</span><span>Satélite e relevo disponíveis com Google Maps.</span></div>}
    </div>
  );
}
