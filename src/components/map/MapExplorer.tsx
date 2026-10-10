"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Compass,
  Crosshair,
  Globe2,
  Layers3,
  LoaderCircle,
  MapPin,
  Minus,
  Mountain,
  Plus,
  RotateCcw,
  Satellite,
} from "lucide-react";
import type { Coordinates, Place } from "@/types/explorer";
import "./map.css";

type MapExplorerProps = {
  apiKey: string;
  place: Place | null;
  onSelectCoordinates: (coordinates: Coordinates) => void;
  onSelectPlaceId: (id: string) => void;
  onExplore: () => void;
  busy: boolean;
  active: boolean;
};

type MapLibraries = {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
};
type MapType = "roadmap" | "satellite" | "terrain";
type LoadState = "loading" | "ready" | "error";
type MapLoadState = { apiKey: string; attempt: number; status: LoadState; error?: MapsLoadError; map?: google.maps.Map };

class MapsLoadError extends Error {
  constructor(message: string, readonly requiresReload = false) {
    super(message);
    this.name = "MapsLoadError";
  }
}

declare global {
  interface Window {
    __worldExplorerMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

let mapsLoader: Promise<MapLibraries> | null = null;
let mapsApiKey: string | null = null;
let mapsFatalError: MapsLoadError | null = null;
const authenticationListeners = new Set<(error: MapsLoadError) => void>();
const SCRIPT_ID = "world-explorer-google-maps";
const LOAD_TIMEOUT = 20_000;

/** Shared across mounts, including React Strict Mode's development remount. */
function loadGoogleMaps(apiKey: string): Promise<MapLibraries> {
  if (mapsFatalError) return Promise.reject(mapsFatalError);
  if (mapsApiKey && mapsApiKey !== apiKey) {
    return Promise.reject(new MapsLoadError("A configuração do mapa mudou. Recarregue a página para aplicá-la.", true));
  }
  if (mapsLoader) return mapsLoader;
  mapsApiKey = apiKey;

  mapsLoader = new Promise<MapLibraries>((resolve, reject) => {
    let settled = false;
    const fail = (error: MapsLoadError) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      // Keep the callback callable: a delayed script can finish after the timeout.
      window.__worldExplorerMapsReady = () => {};
      reject(error);
    };
    const timeout = window.setTimeout(() => {
      mapsFatalError = new MapsLoadError("O mapa demorou demais para responder. Verifique sua conexão e recarregue a página.", true);
      fail(mapsFatalError);
    }, LOAD_TIMEOUT);
    window.gm_authFailure = () => {
      mapsFatalError = new MapsLoadError("O Google Maps não autorizou o acesso. Verifique a configuração da chave e recarregue a página.", true);
      fail(mapsFatalError);
      for (const listener of authenticationListeners) listener(mapsFatalError);
    };

    window.__worldExplorerMapsReady = () => {
      if (settled) return;
      // Also catch synchronous bootstrap errors rather than leaving an uncaught callback.
      Promise.resolve().then(() => Promise.all([
        google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
      ]))
        .then(([maps, markers]) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          window.__worldExplorerMapsReady = () => {};
          resolve({ Map: maps.Map, AdvancedMarkerElement: markers.AdvancedMarkerElement });
        })
        .catch(() => fail(new MapsLoadError("Não foi possível carregar os recursos do Google Maps. Verifique sua conexão e tente novamente.")));
    };

    // A library request can fail after the SDK has loaded. Reuse that SDK on retry.
    if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") {
      window.__worldExplorerMapsReady();
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.onerror = () => {
      script.remove();
      fail(new MapsLoadError("Não foi possível conectar ao Google Maps. Verifique sua conexão e tente novamente."));
    };
    const parameters = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      libraries: "maps,marker",
      language: "pt-BR",
      region: "BR",
      callback: "__worldExplorerMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${parameters.toString()}`;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    mapsLoader = null;
    throw error;
  });

  return mapsLoader;
}

const mapTypes = [
  { id: "roadmap", label: "Mapa", Icon: Layers3 },
  { id: "satellite", label: "Satélite", Icon: Satellite },
  { id: "terrain", label: "Relevo", Icon: Mountain },
] as const;

function coordinateLabel({ lat, lng }: Coordinates) {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? "S" : "N"} · ${Math.abs(lng).toFixed(4)}° ${lng < 0 ? "O" : "L"}`;
}

function CartographicPreview() {
  return (
    <div className="map-preview" aria-hidden="true">
      <div className="map-preview-grid" />
      <div className="map-preview-orbit map-preview-orbit-one" />
      <div className="map-preview-orbit map-preview-orbit-two" />
      <div className="map-preview-sphere">
        <svg viewBox="0 0 500 500" className="map-preview-geography" fill="none">
          <defs>
            <clipPath id="map-globe-clip"><circle cx="250" cy="250" r="238" /></clipPath>
            <radialGradient id="map-globe-light" cx="0.32" cy="0.23" r="0.85">
              <stop stopColor="#638778" stopOpacity="0.2" />
              <stop offset="1" stopColor="#141f1b" stopOpacity="0.1" />
            </radialGradient>
          </defs>
          <g clipPath="url(#map-globe-clip)">
            <circle cx="250" cy="250" r="238" fill="url(#map-globe-light)" />
            <g stroke="#8aab9b" strokeOpacity="0.18" strokeWidth="0.7">
              {[66, 128, 188].map((radius) => <ellipse key={radius} cx="250" cy="250" rx={radius} ry="238" />)}
              {[92, 166, 250, 334, 408].map((y) => <path key={y} d={`M 12 ${y} Q 250 ${y + 32} 488 ${y}`} />)}
              <path d="M250 12v476M12 250h476" />
            </g>
            <g fill="#536b5c" fillOpacity="0.38" stroke="#a0b899" strokeOpacity="0.38" strokeWidth="1.2" strokeLinejoin="round">
              <path d="M24 114 50 91 80 88 92 68 138 59 152 74 170 70 193 94 193 111 169 127 156 147 138 145 126 166 138 188 119 202 115 224 99 239 95 222 79 211 74 183 56 167 40 162 27 139Z" />
              <path d="M109 226 127 237 143 254 152 280 165 287 169 311 156 333 151 360 138 380 130 400 118 391 115 365 104 345 106 318 93 295 90 270 100 251Z" />
              <path d="M162 33 192 27 209 46 199 73 181 82 170 69Z" />
              <path d="M243 114 259 96 281 100 286 118 301 126 290 143 270 146 262 159 241 152 229 136Z" />
              <path d="M252 162 281 155 304 166 318 189 332 205 325 226 310 238 303 269 284 300 268 301 262 278 247 259 244 231 226 214 228 192 239 181Z" />
              <path d="M285 97 310 76 335 78 352 65 382 72 401 85 429 89 450 110 448 131 426 143 421 164 404 170 389 193 372 192 357 209 341 197 334 173 319 163 303 145 313 126 293 121Z" />
              <path d="M343 208 356 217 366 240 360 261 347 245 338 224Z" />
              <path d="M377 235 391 241 398 261 419 270 424 282 403 280 384 267Z" />
              <path d="M396 314 423 307 447 319 461 344 446 363 425 362 412 370 392 354 382 331Z" />
              <path d="M462 377 470 390 463 403 457 396Z" />
              <path d="M92 463 161 450 215 458 249 448 297 454 348 442 398 458 423 485 84 487Z" />
            </g>
            <g fill="#c6deab">
              <circle cx="273" cy="137" r="3" />
              <circle cx="117" cy="322" r="3" />
              <circle cx="410" cy="167" r="3" />
            </g>
            <path d="M117 322Q126 104 273 137T410 167" stroke="#c6deab" strokeOpacity="0.42" strokeDasharray="3 5" />
          </g>
          <circle cx="250" cy="250" r="238" stroke="#a4b69c" strokeOpacity="0.25" />
        </svg>
      </div>
      <span className="map-preview-coordinate map-preview-coordinate-west">23° 33′ S</span>
      <span className="map-preview-coordinate map-preview-coordinate-east">46° 38′ O</span>
      <div className="map-preview-cross map-preview-cross-one">+</div>
      <div className="map-preview-cross map-preview-cross-two">+</div>
    </div>
  );
}

export function MapExplorer({ apiKey, place, onSelectCoordinates, onSelectPlaceId, onExplore, busy, active }: MapExplorerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const librariesRef = useRef<MapLibraries | null>(null);
  const selectRef = useRef(onSelectCoordinates);
  const placeIdRef = useRef(onSelectPlaceId);
  const lastClickRef = useRef<Coordinates | null>(null);
  const lastPositionRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<MapLoadState>(() => ({ apiKey, attempt: 0, status: "loading" }));
  const [attempt, setAttempt] = useState(0);
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const currentLoad = loadState.apiKey === apiKey && loadState.attempt === attempt;
  const state = currentLoad ? loadState.status : "loading";
  const loadError = currentLoad ? loadState.error : undefined;

  useEffect(() => { selectRef.current = onSelectCoordinates; placeIdRef.current = onSelectPlaceId; }, [onSelectCoordinates, onSelectPlaceId]);

  useEffect(() => {
    if (!apiKey || !canvasRef.current) return;
    let cancelled = false;
    let clickListener: google.maps.MapsEventListener | null = null;
    const authenticationFailed = (error: MapsLoadError) => {
      if (!cancelled) setLoadState({ apiKey, attempt, status: "error", error });
    };
    authenticationListeners.add(authenticationFailed);
    const canvas = canvasRef.current;

    loadGoogleMaps(apiKey)
      .then((libraries) => {
        if (cancelled) return;
        if (mapsFatalError) throw mapsFatalError;
        librariesRef.current = libraries;
        const map = new libraries.Map(canvas, {
          center: { lat: 18, lng: -24 },
          zoom: 2,
          minZoom: 1,
          mapId: "DEMO_MAP_ID",
          colorScheme: google.maps.ColorScheme.DARK,
          mapTypeId: "roadmap",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          cameraControl: false,
          gestureHandling: "greedy",
          keyboardShortcuts: true,
          clickableIcons: true,
          backgroundColor: "#18231f",
        });
        mapRef.current = map;
        clickListener = map.addListener("click", (event: google.maps.MapMouseEvent | google.maps.IconMouseEvent) => {
          if (!event.latLng) return;
          const coordinates = event.latLng.toJSON();
          lastClickRef.current = coordinates;
          if ("placeId" in event) {
            event.stop();
            if (typeof event.placeId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(event.placeId)) {
              placeIdRef.current(event.placeId);
              return;
            }
          }
          selectRef.current(coordinates);
        });
        if (mapsFatalError) throw mapsFatalError;
        setLoadState({ apiKey, attempt, status: "ready", map });
      })
      .catch((failure: unknown) => {
        const error = failure instanceof MapsLoadError ? failure : new MapsLoadError("Não foi possível iniciar o mapa. Tente novamente.");
        if (!cancelled) setLoadState({ apiKey, attempt, status: "error", error });
      });

    return () => {
      cancelled = true;
      authenticationListeners.delete(authenticationFailed);
      clickListener?.remove();
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      if (mapRef.current) google.maps.event.clearInstanceListeners(mapRef.current);
      mapRef.current = null;
      librariesRef.current = null;
      lastPositionRef.current = null;
      canvas.replaceChildren();
    };
  }, [apiKey, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    const libraries = librariesRef.current;
    if (state !== "ready" || !map || loadState.map !== map || !libraries) return;
    if (!place) {
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      lastPositionRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = document.createElement("div");
      marker.className = "map-selected-marker";
      const center = document.createElement("span");
      marker.appendChild(center);
      markerRef.current = new libraries.AdvancedMarkerElement({
        map,
        content: marker,
        position: place.coordinates,
        title: place.name,
      });
    } else {
      markerRef.current.position = place.coordinates;
      markerRef.current.title = place.name;
    }

    const key = `${place.coordinates.lat},${place.coordinates.lng}`;
    if (lastPositionRef.current !== key) {
      const clicked = lastClickRef.current;
      const clickedHere = clicked && Math.abs(clicked.lat - place.coordinates.lat) < 0.0001 && Math.abs(clicked.lng - place.coordinates.lng) < 0.0001;
      if (!clickedHere) {
        map.panTo(place.coordinates);
        if ((map.getZoom() ?? 3) < 10) map.setZoom(11);
      }
      lastPositionRef.current = key;
      lastClickRef.current = null;
    }
  }, [place, state, loadState.map]);

  useEffect(() => {
    if (state === "ready") mapRef.current?.setMapTypeId(mapType);
  }, [mapType, state, loadState.map]);

  useEffect(() => {
    if (!active || state !== "ready" || !mapRef.current) return;
    const frame = requestAnimationFrame(() => {
      if (mapRef.current) google.maps.event.trigger(mapRef.current, "resize");
    });
    return () => cancelAnimationFrame(frame);
  }, [active, state, loadState.map]);

  const mapReady = Boolean(apiKey) && state === "ready";

  function retry() {
    if (loadError?.requiresReload) {
      window.location.reload();
      return;
    }
    setAttempt((current) => current + 1);
  }

  return (
    <section className="map-explorer" aria-label="Exploração pelo mapa" hidden={!active}>
      <div ref={canvasRef} className="map-canvas" aria-label="Mapa interativo: arraste para navegar e clique para selecionar um local" />

      {!mapReady && <CartographicPreview />}

      <div className="map-topbar">
        <div className="map-mode-label"><span className={mapReady ? "map-status-dot map-status-live" : "map-status-dot"} />VISTA GLOBAL</div>
        <div className="map-type-switch" role="group" aria-label="Tipo de mapa">
          {mapTypes.map(({ id, label, Icon }) => (
            <button key={id} className={mapType === id ? "map-type-button map-type-active" : "map-type-button"} type="button" aria-pressed={mapType === id} disabled={!mapReady} onClick={() => setMapType(id)}>
              <Icon size={15} aria-hidden="true" /><span>{label}</span>
              {mapType === id && <Check className="map-type-check" size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </div>

      {!apiKey ? (
        <div className="map-message map-configuration-message">
          <span className="map-message-eyebrow"><Globe2 size={14} aria-hidden="true" /> UM MUNDO DE POSSIBILIDADES</span>
          <h2>O próximo destino<br />começa com curiosidade.</h2>
          <p>Mapa disponível após configurar o Google Maps. Enquanto isso, descubra lugares pela busca.</p>
          <span className="map-preview-notice">Ilustração geográfica · mapa interativo indisponível</span>
        </div>
      ) : state === "loading" ? (
        <div className="map-message map-loading-message" role="status">
          <LoaderCircle className="map-spinner" size={24} aria-hidden="true" />
          <h2>Abrindo novos horizontes.</h2>
          <p>Carregando o mapa do mundo…</p>
        </div>
      ) : state === "error" ? (
        <div className="map-message map-error-message" role="alert">
          <Globe2 size={28} aria-hidden="true" />
          <h2>O mapa não carregou.</h2>
          <p>{loadError?.message ?? "Verifique sua conexão e a configuração do Google Maps."} Você pode continuar explorando pela busca.</p>
          <button className="map-retry-button" type="button" onClick={retry}><RotateCcw size={15} aria-hidden="true" />{loadError?.requiresReload ? "Recarregar página" : "Tentar novamente"}</button>
        </div>
      ) : null}

      <div className="map-compass" aria-hidden="true"><span>N</span><Compass size={28} strokeWidth={1.25} /><span>S</span></div>

      {place && mapReady && (
        <div className="map-selection" aria-live="polite">
          <div className="map-selection-heading"><span className="map-selection-pin"><MapPin size={18} aria-hidden="true" /></span><div><span className="map-selection-eyebrow">SEU PRÓXIMO PONTO DE PARTIDA</span><h3>{place.name}</h3></div></div>
          {place.address && <p className="map-selection-address">{place.address}</p>}
          <p className="map-selection-coordinates"><Crosshair size={12} aria-hidden="true" />{coordinateLabel(place.coordinates)}</p>
          <button className="map-explore-button" type="button" disabled={busy} onClick={onExplore}>{busy ? <><LoaderCircle size={16} className="map-spinner" aria-hidden="true" />Explorando…</> : <>Explorar este local<ArrowUpRight size={18} aria-hidden="true" /></>}</button>
        </div>
      )}

      {mapReady && (
        <>
          {!place && <div className="map-navigation-hint"><Crosshair size={15} aria-hidden="true" /><span>Arraste para descobrir. Clique para selecionar.</span></div>}
          <div className="map-navigation" role="group" aria-label="Navegação do mapa">
            <button type="button" aria-label="Voltar à visão global" title="Voltar à visão global" onClick={() => { mapRef.current?.setZoom(2); mapRef.current?.panTo({ lat: 18, lng: -24 }); }}><Globe2 size={19} aria-hidden="true" /></button>
            {place && <button type="button" aria-label="Centralizar no local selecionado" title="Centralizar no local selecionado" onClick={() => mapRef.current?.panTo(place.coordinates)}><Crosshair size={19} aria-hidden="true" /></button>}
            <span className="map-navigation-divider" />
            <button type="button" aria-label="Aproximar mapa" title="Aproximar" onClick={() => { const map = mapRef.current; if (map) map.setZoom((map.getZoom() ?? 3) + 1); }}><Plus size={20} aria-hidden="true" /></button>
            <button type="button" aria-label="Afastar mapa" title="Afastar" onClick={() => { const map = mapRef.current; if (map) map.setZoom((map.getZoom() ?? 3) - 1); }}><Minus size={20} aria-hidden="true" /></button>
          </div>
        </>
      )}

      {!mapReady && <div className="map-preview-footer"><span>EXPLORE ALÉM DO ÓBVIO</span><span>EST. 2026</span></div>}
    </section>
  );
}

export default MapExplorer;
