"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Check, Compass, Globe2, History, LoaderCircle, Map as MapIcon, MapPin, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { gsap } from "gsap";
import { SearchBox } from "@/components/search/SearchBox";
import { MapExplorer } from "@/components/map/MapExplorer";
import { CinematicView } from "@/components/destination/CinematicView";
import { Globe } from "@/components/ui/Globe";
import { browserStorage, postJson, readRefs, refKey, refLabel, RequestGate, saveRefs, toggleRef } from "@/lib/client";
import type { AppConfig, Coordinates, Destination, Place, PlaceRef } from "@/types/explorer";

const FAVORITES = "world-explorer:favorites:v1";
const HISTORY = "world-explorer:history:v1";
type Mode = "welcome" | "map" | "cinematic";

export function Explorer({ config }: { config: AppConfig }) {
  const [mode, setMode] = useState<Mode>("welcome");
  const [mapMounted, setMapMounted] = useState(false);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [favorites, setFavorites] = useState<PlaceRef[]>([]);
  const [history, setHistory] = useState<PlaceRef[]>([]);
  const [drawer, setDrawer] = useState<"favorites" | "history">("favorites");
  const [names, setNames] = useState<Record<string, string>>({});
  const [labelsLoading, setLabelsLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const gate = useRef(new RequestGate());
  const labelGate = useRef(new RequestGate());
  const lastAttempt = useRef<{ref:PlaceRef; token?:string; target:Mode} | null>(null);

  useEffect(() => {
    // A new scene starts at its introduction, including navigation from nearby cards.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [mode, destination?.place.id]);

  useEffect(() => {
    // Browser storage is read only after hydration, so SSR never touches private local data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(browserStorage() ? readRefs(browserStorage()!, FAVORITES) : []);
    setHistory(browserStorage() ? readRefs(browserStorage()!, HISTORY) : []);
    const requestGate = gate.current;
    const labels = labelGate.current;
    return () => { requestGate.cancel(); labels.cancel(); };
  }, []);

  useEffect(() => {
    if (mode !== "welcome" || !hero.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.from(".hero-reveal", { y: 28, opacity: 0, duration: .9, stagger: .11, ease: "power3.out", clearProps: "all" });
        gsap.from(".globe-art", { scale: .92, opacity: 0, duration: 1.5, ease: "power2.out", clearProps: "all" });
      }, hero);
      return () => context.revert();
    });
    return () => media.revert();
  }, [mode]);

  const persist = useCallback((key: string, refs: PlaceRef[]) => {
    const storage = browserStorage();
    if (!storage || !saveRefs(storage, key, refs)) setStorageMessage("O navegador não permitiu salvar seus lugares. Eles ficam disponíveis nesta sessão.");
  }, []);

  const loadDestination = useCallback(async (ref: PlaceRef, token?: string, target: Mode = "map") => {
    const request = gate.current.begin();
    // A Places autocomplete token is consumed by the first details request; retries use no token.
    lastAttempt.current = { ref, target };
    setBusy("Consultando localização, informações e fotografias…"); setError("");
    if (target === "map") { setMapMounted(true); setMode("map"); }
    try {
      const result = await postJson<Destination>("/api/destination", { ref, sessionToken: token }, request.signal);
      if (!request.isCurrent()) return;
      setDestination(result); setPlace(result.place); setMode(target);
      setNames(previous => ({ ...previous, [refKey(ref)]: result.place.name, [refKey(result.place.ref)]: result.place.name }));
      setHistory(previous => {
        const updated = [result.place.ref, ...previous.filter(item => refKey(item) !== refKey(result.place.ref))].slice(0, 12);
        persist(HISTORY, updated); return updated;
      });
    } catch (failure) {
      if (request.isCurrent()) setError(failure instanceof Error ? failure.message : "Não foi possível explorar este local.");
    } finally { if (request.isCurrent()) setBusy(""); }
  }, [persist]);

  async function selectCoordinates(coordinates: Coordinates) {
    const request = gate.current.begin();
    const ref: PlaceRef = { provider: "coordinates", ...coordinates };
    lastAttempt.current = { ref, target: "map" };
    setBusy("Identificando o ponto selecionado…"); setError("");
    try {
      const result = await postJson<Place>("/api/reverse", coordinates, request.signal);
      if (!request.isCurrent()) return;
      setPlace(result); setDestination(null);
    } catch (failure) {
      if (request.isCurrent()) setError(failure instanceof Error ? failure.message : "Não foi possível identificar este ponto.");
    } finally { if (request.isCurrent()) setBusy(""); }
  }

  function navigate(target: Mode) {
    gate.current.cancel(); setBusy(""); setError(""); setMode(target);
    if (target === "map") setMapMounted(true);
  }
  function openMap() { navigate("map"); }
  function explore() {
    if (destination && place?.id === destination.place.id) setMode("cinematic");
    else if (place) void loadDestination(place.ref, undefined, "cinematic");
  }
  function favorite() {
    if (!destination) return;
    setFavorites(previous => { const result = toggleRef(previous, destination.place.ref); persist(FAVORITES, result); return result; });
  }

  async function openDrawer(kind: "favorites" | "history") {
    setDrawer(kind); if (!dialog.current?.open) dialog.current?.showModal();
    const refs = kind === "favorites" ? favorites : history;
    const request = labelGate.current.begin();
    const missing = refs.filter(ref => ref.provider !== "coordinates" && !names[refKey(ref)]);
    setLabelsLoading(missing.length > 0);
    if (!missing.length) return;
    // Small sequential batches avoid a burst of billable Place Details calls.
    for (let i = 0; i < missing.length && request.isCurrent(); i += 3) {
      await Promise.all(missing.slice(i, i + 3).map(async ref => {
        try {
          const result = await postJson<Place>("/api/resolve", { ref }, request.signal);
          if (request.isCurrent()) setNames(previous => ({ ...previous, [refKey(ref)]: result.name }));
        } catch { /* The saved ID remains actionable; no invented label replaces a failed refresh. */ }
      }));
    }
    if (request.isCurrent()) setLabelsLoading(false);
  }

  const saved = !!destination && favorites.some(ref => refKey(ref) === refKey(destination.place.ref));
  const displayedRefs = drawer === "favorites" ? favorites : history;

  return <div className={`explorer-app mode-${mode}`}>
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <header className="app-header">
      <button className="brand" aria-label="World Explorer — início" onClick={() => navigate("welcome")}><span className="brand-symbol"><Globe2 size={27} strokeWidth={1.2} /></span><span>WORLD<span className="brand-secondary">EXPLORER</span></span></button>
      {mode !== "welcome" && <SearchBox compact onSelect={(ref, token) => void loadDestination(ref, token, mode === "cinematic" ? "cinematic" : "map")} />}
      <nav aria-label="Navegação principal" className="header-actions">
        <button aria-label="Explorar" className={mode === "map" ? "nav-button active" : "nav-button"} onClick={openMap}><Compass size={16} /><span>Explorar</span></button>
        <button aria-label="Meus lugares" className="nav-button" onClick={() => void openDrawer("favorites")}><Bookmark size={16} /><span>Meus lugares</span>{favorites.length > 0 && <small>{favorites.length}</small>}</button>
        <button className="icon-button history-button" aria-label="Abrir histórico" onClick={() => void openDrawer("history")}><History size={19} /></button>
      </nav>
    </header>

    <main id="main">
      {mode === "welcome" && <div className="welcome" ref={hero}>
        <div className="welcome-grain" />
        <Globe />
        <div className="hero-copy">
          <p className="eyebrow hero-reveal"><span /> UM PLANETA. INFINITAS DESCOBERTAS.</p>
          <h1 className="hero-reveal">O mundo tem<br /><em>histórias.</em><br />Encontre a sua.</h1>
          <p className="hero-description hero-reveal">De um ponto no mapa a uma nova perspectiva.<br className="desktop-break" /> Explore paisagens, lugares e as histórias que os conectam.</p>
          <div className="hero-search hero-reveal"><SearchBox onSelect={(ref, token) => void loadDestination(ref, token)} /></div>
          <div className="hero-cta hero-reveal"><button className="primary-button" onClick={openMap}>Explorar o mapa <ArrowUpRight size={19} /></button><span>Ou comece por um lugar que desperta<br />a sua curiosidade.</span></div>
        </div>
        <div className="hero-bottom hero-reveal"><span><span className="status-dot" /> FEITO PARA EXPLORADORES CURIOSOS</span><span className="hero-scroll"><ArrowDown size={15} /> CADA LUGAR, UMA NOVA PERSPECTIVA</span><span className="edition">EST. 2026 <span>©</span></span></div>
        <div className="welcome-features"><div><MapPin size={20} /><span><strong>Escolha qualquer lugar</strong><small>Uma cidade, uma montanha, um ponto no mapa.</small></span></div><div><Sparkles size={20} /><span><strong>Descubra outra perspectiva</strong><small>Fotografias reais. Histórias com fontes.</small></span></div><div><Bookmark size={20} /><span><strong>Guarde suas descobertas</strong><small>Seus lugares favoritos, sempre por perto.</small></span></div></div>
      </div>}

      {mode !== "welcome" && <div className="explorer-toolbar"><div className="mode-switch" aria-label="Modo de exploração"><button className={mode === "map" ? "selected" : ""} aria-pressed={mode === "map"} onClick={openMap}><MapIcon size={15} /> Mapa</button><button className={mode === "cinematic" ? "selected" : ""} aria-pressed={mode === "cinematic"} disabled={!place || !!busy} onClick={explore}><Sparkles size={15} /> Cinemático</button></div><p>{place ? place.name : "Seu próximo destino começa com uma descoberta."}</p></div>}

      {busy && <div className="request-banner" role="status"><LoaderCircle size={18} className="spin" /><span>{busy}</span><button onClick={() => { gate.current.cancel(); setBusy(""); }}>Cancelar</button></div>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => { const attempt = lastAttempt.current; if (attempt) void loadDestination(attempt.ref, attempt.token, attempt.target); }}><RefreshCw size={15} /> Tentar novamente</button><button className="icon-button" aria-label="Fechar erro" onClick={() => setError("")}><X size={16} /></button></div>}
      {storageMessage && <div className="request-banner" role="status"><span>{storageMessage}</span><button onClick={() => setStorageMessage("")}>Entendi</button></div>}
      {mapMounted && <div hidden={mode !== "map"}><MapExplorer apiKey={config.googleMapsKey} place={place} onSelectCoordinates={coordinates => void selectCoordinates(coordinates)} onSelectPlaceId={id => void loadDestination({ provider: "google", id }, undefined, "map")} onExplore={explore} busy={!!busy} active={mode === "map"} /></div>}
      {mode === "cinematic" && destination && <CinematicView destination={destination} onSelect={ref => void loadDestination(ref, undefined, "cinematic")} onMap={openMap} onFavorite={favorite} isFavorite={saved} />}
      {mode === "map" && destination && <aside className="destination-peek">
        <div><p className="eyebrow">SEU PRÓXIMO CAPÍTULO</p><h2>{destination.place.name}</h2><p>{destination.summary || "Explore as informações geográficas disponíveis para este local."}</p>
          <div className="provider-sources">
            {destination.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}
            {destination.summary && destination.sources.some(source => source.url.includes("wikipedia.org")) && <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">Texto sob CC BY-SA 4.0</a>}
          </div>
          {destination.place.source === "Google Maps" && <a className="provider-google" href="https://maps.google.com/" target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="google-maps-logo" src="/attribution/google-maps.svg" height="18" alt="Google Maps" />
          </a>}
          {destination.warnings.length > 0 && <details><summary>Disponibilidade das fontes</summary><ul>{destination.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
        </div><button className="primary-button" onClick={explore} disabled={!!busy}>Explorar este local <ArrowRight size={18} /></button>
      </aside>}
    </main>

    <footer className="app-footer"><span>WORLD EXPLORER <span className="footer-divider">/</span> Siga a sua curiosidade.</span><nav aria-label="Informações legais"><a href="/privacidade">Privacidade</a><a href="/termos">Termos e fontes</a></nav></footer>

    <dialog className="places-dialog" ref={dialog} onClose={() => { labelGate.current.cancel(); setLabelsLoading(false); }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="places-dialog-title">
      <div className="drawer-top"><p className="eyebrow">SEU CADERNO DE VIAGEM</p><button className="icon-button" aria-label="Fechar lugares salvos" onClick={() => dialog.current?.close()}><X size={21} /></button></div>
      <h2 id="places-dialog-title">{drawer === "favorites" ? "Meus lugares." : "Por onde você passou."}</h2>
      <p className="drawer-description">{drawer === "favorites" ? "Guarde o que desperta a sua curiosidade. Volte quando quiser." : "Suas últimas descobertas, prontas para um novo olhar."}</p>
      <div className="drawer-tabs"><button className={drawer === "favorites" ? "active" : ""} onClick={() => void openDrawer("favorites")}><Bookmark size={16} /> Favoritos</button><button className={drawer === "history" ? "active" : ""} onClick={() => void openDrawer("history")}><History size={16} /> Histórico</button></div>
      {labelsLoading && <p role="status" className="drawer-description">Atualizando nomes dos lugares…</p>}
      {displayedRefs.length === 0 ? <div className="places-empty"><Compass size={39} strokeWidth={1} /><h3>A próxima descoberta é sua.</h3><p>{drawer === "favorites" ? "Toque no marcador de favorito durante uma exploração para guardar um lugar aqui." : "Pesquise um lugar e suas descobertas aparecerão aqui."}</p><button className="primary-button" onClick={() => { dialog.current?.close(); openMap(); }}>Começar a explorar <ArrowUpRight size={17} /></button></div> : <ul className="saved-places">{displayedRefs.map((ref, index) => <li key={refKey(ref)}><button onClick={() => { dialog.current?.close(); void loadDestination(ref, undefined, "cinematic"); }}><span className="saved-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{names[refKey(ref)] || refLabel(ref)}</strong><small>{ref.provider === "google" ? "Google Maps" : ref.provider === "wikipedia" ? "Wikipedia" : "Coordenadas selecionadas"}</small></span><ArrowUpRight size={19} /></button>{drawer === "favorites" && <button className="icon-button" aria-label={`Remover ${names[refKey(ref)] || refLabel(ref)} dos favoritos`} onClick={() => { const updated = favorites.filter(item => refKey(item) !== refKey(ref)); setFavorites(updated); persist(FAVORITES, updated); }}><Trash2 size={16} /></button>}</li>)}</ul>}
      {displayedRefs.length > 0 && <button className="clear-saved" onClick={() => { if (drawer === "history") { setHistory([]); persist(HISTORY, []); } else { setFavorites([]); persist(FAVORITES, []); } }}><Trash2 size={14} /> {drawer === "history" ? "Limpar histórico" : "Limpar favoritos"}</button>}
      <p className="storage-note"><Check size={13} /> Salvos apenas neste navegador. Sem conta, sem fotografias armazenadas.</p>
    </dialog>
  </div>;
}
