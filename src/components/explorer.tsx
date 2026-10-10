'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bookmark, Check, Compass, Film, Globe2, Heart, History, Info, Map, MapPin, MoveUpRight, RotateCcw, Search, Sparkles, Trash2, X } from 'lucide-react';
import gsap from 'gsap';
import { referenceKey } from '@/lib/format';
import { useExplorer } from '@/hooks/use-explorer';
import MapCanvas from '@/components/map/map-canvas';
import SearchBox from '@/components/search/search-box';
import Dialog from '@/components/ui/dialog';
import GlobeArt from '@/components/ui/globe-art';
import CinematicHero from '@/components/destination/cinematic-hero';
import DestinationDetails, { LocationCredit, PhotoCredit } from '@/components/destination/destination-details';
import NearbyPlaces from '@/components/destination/nearby-places';
import PhotoFrame from '@/components/destination/photo-frame';
import type { PlaceReference } from '@/types/explorer';

function savedLabel(reference: PlaceReference, index: number) {
  if (reference.provider === 'wikipedia') return /^\d+$/.test(reference.id) ? `Página Wikipédia #${reference.id}` : reference.id.replace(/_/g, ' ');
  if (reference.provider === 'coordinates') return `${reference.lat.toFixed(4)}°, ${reference.lng.toFixed(4)}°`;
  return `Lugar salvo ${String(index + 1).padStart(2, '0')}`;
}

export default function Explorer() {
  const explorer = useExplorer();
  const [welcome, setWelcome] = useState(true);
  const [dialog, setDialog] = useState<'saved' | 'about' | 'details' | null>(null);
  const [savedTab, setSavedTab] = useState<'favorites' | 'recent'>('favorites');
  const welcomeRef = useRef<HTMLDivElement>(null);
  const { config, configError, destination, location, mode, setMode, loading, stage, error, favorites, recent, isFavorite } = explorer;
  const provider = config?.mapProvider ?? 'open';
  const mapVisible = !welcome && mode === 'map';
  const cinematicVisible = !welcome && mode === 'cinematic';

  useEffect(() => {
    if (!welcome || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo('[data-intro]', { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, stagger: 0.11, ease: 'power3.out', clearProps: 'all' });
      gsap.fromTo('.globe-art', { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.8, ease: 'power2.out', clearProps: 'all' });
    }, welcomeRef);
    return () => context.revert();
  }, [welcome]);

  function showMap(focusSearch = false) {
    if (focusSearch) explorer.clearError();
    setWelcome(false);
    setMode('map');
    if (focusSearch) window.setTimeout(() => document.querySelector<HTMLInputElement>('.search-input')?.focus(), 50);
  }

  function selectPlace(reference: PlaceReference, sessionToken?: string) {
    if (welcome) setMode('cinematic');
    setWelcome(false);
    setDialog(null);
    void explorer.loadDestination(reference, sessionToken);
  }

  function openSaved(reference: PlaceReference) {
    setWelcome(false);
    setMode('cinematic');
    setDialog(null);
    void explorer.openSaved(reference);
  }

  return (
    <main className="explorer-app" id="top">
      <a className="skip-link" href="#explorer-content">Ir para a exploração</a>
      <div className={`explorer-scene ${welcome ? 'welcome-scene' : ''} ${mapVisible ? 'map-scene' : ''}`}>
        <div className={`map-stage ${mapVisible ? 'map-stage-visible' : 'map-stage-hidden'}`} aria-hidden={!mapVisible} inert={!mapVisible}>
          {config && <MapCanvas provider={provider} location={location} onSelectCoordinates={coordinates => { setWelcome(false); void explorer.selectCoordinates(coordinates); }} onSelectPlace={reference => selectPlace(reference)} visible={mapVisible} />}
        </div>

        <header className="app-header">
          <button type="button" className="brand" aria-label="World Explorer, início" onClick={() => setWelcome(true)}><span className="brand-mark"><Compass size={27} strokeWidth={1.3} /></span><span className="brand-name">WORLD<span>EXPLORER</span></span></button>
          <div className="header-search"><SearchBox onSelect={selectPlace} disabled={!config} provider={provider} /></div>
          <nav className="header-nav" aria-label="Navegação principal"><button type="button" className="nav-button places-button" onClick={() => { setSavedTab('favorites'); setDialog('saved'); }}><Bookmark size={17} /><span>Seus lugares</span>{favorites.length > 0 && <span className="favorite-count">{favorites.length}</span>}</button><button type="button" className="icon-button about-button" onClick={() => setDialog('about')} aria-label="Sobre o World Explorer"><Info size={19} /></button></nav>
        </header>

        <div id="explorer-content" className="scene-content" tabIndex={-1}>
          {welcome && <div className="welcome-content" ref={welcomeRef}>
            <div className="welcome-background-word" aria-hidden="true">WORLD</div>
            <GlobeArt />
            <div className="hero-copy welcome-copy">
              <p className="eyebrow" data-intro><span className="eyebrow-line" />PARA ONDE A CURIOSIDADE LEVAR</p>
              <h1 className="welcome-title" data-intro>O MUNDO<br />É SÓ O<br /><span>COMEÇO.</span></h1>
              <p className="hero-description" data-intro>Há uma história em cada coordenada.<br />Encontre um lugar. Mude de perspectiva.<br />Descubra o extraordinário.</p>
              <button className="button button-primary welcome-cta" type="button" onClick={() => showMap(true)} disabled={!config} data-intro>Comece a explorar <ArrowUpRight size={21} /></button>
              <span className="welcome-button-caption" data-intro>Seu próximo destino começa com uma busca.</span>
            </div>
            <div className="welcome-side-note"><span className="vertical-line" /><span>FEITO PARA OS CURIOSOS</span><span className="small-compass">N ↑</span></div>
            <div className="welcome-bottom" data-intro><div className="welcome-feature"><Globe2 size={20} strokeWidth={1.25} /><span>O planeta ao seu alcance<small>Escolha um ponto no mapa</small></span></div><div className="welcome-feature"><Sparkles size={20} strokeWidth={1.25} /><span>Mais do que um destino<small>Histórias, imagens e novas perspectivas</small></span></div><button className="welcome-bottom-link" type="button" onClick={() => showMap(true)}><span>DEIXE A CURIOSIDADE GUIAR</span><ArrowRight size={20} /></button></div>
          </div>}

          {mapVisible && !loading && !error && <div className="map-interface">
            {!destination && <div className="map-intro"><span className="eyebrow"><span className="eyebrow-line" />O COMEÇO DE UMA DESCOBERTA</span><h1>O próximo lugar<br />está no mapa.</h1><p>Busque um destino ou escolha um ponto.<br />A curiosidade cuida do resto.</p><span className="map-click-hint"><MapPin size={16} /> Clique em qualquer lugar para explorar.</span></div>}
            {destination && <aside className="location-panel" aria-label={`Local selecionado: ${destination.location.name}`}>
              {destination.photos[0] && <PhotoFrame key={destination.photos[0].id} photo={destination.photos[0]} thumbnail className="location-panel-photo" sizes="380px" />}
              <div className="location-panel-copy"><span className="eyebrow">{destination.location.country || 'LOCAL SELECIONADO'}</span><h1>{destination.location.name}</h1><p>{destination.summary || 'Confira a localização, as fotografias e as informações disponíveis.'}</p><div className="location-panel-actions"><button className="button button-primary" type="button" onClick={() => setMode('cinematic')}>Abrir experiência <MoveUpRight size={17} /></button><button className={`icon-button ${isFavorite ? 'is-favorite' : ''}`} type="button" onClick={explorer.toggleFavorite} aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'} aria-pressed={isFavorite}><Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} /></button></div><p className="location-attribution"><LocationCredit location={destination.location} /></p>{destination.photos[0] && <div className="location-photo-credit"><PhotoCredit photo={destination.photos[0]} /></div>}</div>
            </aside>}
          </div>}

          {cinematicVisible && destination && !loading && !error && <CinematicHero key={referenceKey(destination.location.reference)} destination={destination} isFavorite={isFavorite} onFavorite={explorer.toggleFavorite} onDetails={() => setDialog('details')} onMap={() => showMap()} />}

          {cinematicVisible && !destination && !loading && !error && <div className="empty-cinematic"><GlobeArt compact /><div><span className="eyebrow">SUA PRÓXIMA DESCOBERTA</span><h1>Todo lugar tem<br />uma história.</h1><p>Escolha um destino para começar a experiência.</p><button className="button button-primary" type="button" onClick={() => showMap(true)}>Explorar o mapa <ArrowUpRight size={18} /></button></div></div>}

          {loading && !welcome && <div className="loading-scene" role="status" aria-live="polite" aria-busy="true"><div className="loading-orbit"><Globe2 size={42} strokeWidth={1} /><span /></div><span className="eyebrow">UMA NOVA PERSPECTIVA ESTÁ CHEGANDO</span><h1>{stage === 'locating' ? 'Encontrando o seu lugar.' : 'Revelando a história.'}</h1><p>{stage === 'locating' ? 'Identificando localização' : 'Buscando informações e fotografias'}</p><div className="loading-lines" aria-hidden="true"><span /><span /><span /></div></div>}

          {error && !welcome && <div className="error-scene" role="alert"><div className="error-icon"><Compass size={36} strokeWidth={1.2} /></div><span className="eyebrow">VAMOS ENCONTRAR OUTRO CAMINHO</span><h1>A descoberta<br />pode esperar um instante.</h1><p>{error}</p><div className="error-actions"><button className="button button-primary" type="button" onClick={explorer.retry}><RotateCcw size={17} /> Tentar novamente</button><button className="button button-outline" type="button" onClick={() => showMap(true)}><Search size={17} /> Buscar outro lugar</button></div></div>}

          {configError && <div className="configuration-alert" role="alert"><Info size={18} /><div><strong>Não foi possível preparar a exploração.</strong><p>{configError}</p></div><button type="button" className="button button-outline" onClick={explorer.retryConfig}><RotateCcw size={16} /> Tentar novamente</button></div>}
        </div>

        {!welcome && <div className="explorer-controls"><div className="provider-badge"><span className="provider-dot" /><span className={provider === 'google' ? 'google-maps-attribution' : ''} translate={provider === 'google' ? 'no' : undefined}>{provider === 'google' ? 'Google Maps' : 'OpenStreetMap'}</span></div><div className="view-switch" role="group" aria-label="Modo de exploração"><button type="button" className={mode === 'map' ? 'is-active' : ''} onClick={() => showMap()} aria-pressed={mode === 'map'}><Map size={15} /><span>Mapa</span></button><button type="button" className={mode === 'cinematic' ? 'is-active' : ''} onClick={() => setMode('cinematic')} disabled={!destination && !loading} aria-pressed={mode === 'cinematic'}><Film size={15} /><span>Cinema</span></button></div></div>}
      </div>

      {cinematicVisible && destination && !loading && !error && <NearbyPlaces places={destination.nearby} onSelect={reference => { setMode('cinematic'); selectPlace(reference); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }} />}

      {dialog === 'details' && destination && <DestinationDetails destination={destination} onClose={() => setDialog(null)} />}
      {dialog === 'saved' && <Dialog title="Seus lugares" description="Algumas descobertas merecem uma segunda visita." onClose={() => setDialog(null)}><div className="saved-tabs" role="group" aria-label="Lista de lugares"><button type="button" className={savedTab === 'favorites' ? 'is-active' : ''} onClick={() => setSavedTab('favorites')} aria-pressed={savedTab === 'favorites'}><Heart size={16} /> Favoritos <span>{favorites.length}</span></button><button type="button" className={savedTab === 'recent' ? 'is-active' : ''} onClick={() => setSavedTab('recent')} aria-pressed={savedTab === 'recent'}><History size={16} /> Recentes <span>{recent.length}</span></button></div><div className="saved-content">{(savedTab === 'favorites' ? favorites : recent).length ? <><div className="saved-list">{(savedTab === 'favorites' ? favorites : recent).map((reference, index) => <button type="button" className="saved-place" key={referenceKey(reference)} onClick={() => openSaved(reference)}><span className="saved-place-icon">{savedTab === 'favorites' ? <Heart size={18} /> : <History size={18} />}</span><span><strong>{savedLabel(reference, index)}</strong><small>{reference.provider === 'google' ? 'Google Maps · informações consultadas ao abrir' : reference.provider === 'wikipedia' ? 'Wikipédia · informações consultadas ao abrir' : 'Ponto no mapa · informações consultadas ao abrir'}</small></span><ArrowUpRight size={18} /></button>)}</div>{savedTab === 'recent' && <button className="clear-history" type="button" onClick={explorer.clearRecent}><Trash2 size={15} /> Limpar histórico</button>}<p className="saved-privacy"><Check size={14} /> As referências ficam apenas neste navegador.</p></> : <div className="saved-empty"><span>{savedTab === 'favorites' ? <Heart size={29} strokeWidth={1.25} /> : <History size={29} strokeWidth={1.25} />}</span><h3>{savedTab === 'favorites' ? 'Sua coleção começa com um lugar.' : 'O primeiro passo ainda está por vir.'}</h3><p>{savedTab === 'favorites' ? 'Toque no coração de um destino para encontrá-lo aqui depois.' : 'Os lugares que você explorar aparecerão aqui.'}</p><button className="button button-primary" type="button" onClick={() => { setDialog(null); showMap(true); }}>Encontre um lugar <ArrowUpRight size={17} /></button></div>}</div></Dialog>}

      {dialog === 'about' && <Dialog title="Um novo olhar sobre o mundo." description="World Explorer é um convite para seguir a curiosidade." onClose={() => setDialog(null)}><div className="dialog-content about-content"><div className="about-symbol"><Compass size={62} strokeWidth={0.9} /></div><p>Escolha um ponto no mapa ou busque um lugar. Explore fotografias, histórias e destinos próximos com informações obtidas de fontes públicas.</p><div className="about-step"><span>01</span><div><h3>Encontre o seu lugar</h3><p>Uma cidade, um monumento ou uma coordenada.</p></div></div><div className="about-step"><span>02</span><div><h3>Mude de perspectiva</h3><p>Alterne entre o mapa e a experiência cinematográfica.</p></div></div><div className="about-step"><span>03</span><div><h3>Siga a curiosidade</h3><p>Consulte as fontes e descubra o que está por perto.</p></div></div><p className="about-data-note">O mapa usa {provider === 'google' ? 'Google Maps' : 'OpenStreetMap'}. Textos e fotografias dependem das fontes disponíveis para cada localização. As atribuições acompanham o conteúdo.</p><div className="about-links"><a href="/privacy">Privacidade <ArrowUpRight size={14} /></a><a href="/terms">Termos de uso <ArrowUpRight size={14} /></a></div></div></Dialog>}
      <div className="sr-only" aria-live="polite">{loading ? '' : destination ? `${destination.location.name} está pronto para explorar.` : ''}</div>
      {explorer.notice && <div className="notice-toast" role="status"><Info size={17} /><p>{explorer.notice}</p><button type="button" className="icon-button" onClick={explorer.clearNotice} aria-label="Fechar aviso"><X size={17} /></button></div>}
    </main>
  );
}
