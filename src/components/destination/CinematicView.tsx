"use client";

/* Google images load directly; licensed Commons images use the bounded optimizer. */
/* eslint-disable @next/next/no-img-element */

import { Fragment, useEffect, useId, useRef, useState, type TouchEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Compass, ExternalLink, Heart, ImageOff, MapPin, Navigation, Plus, X } from "lucide-react";
import { gsap } from "gsap";
import Image, { type ImageLoaderProps } from "next/image";
import type { Destination, Photo, PlaceRef } from "@/types/explorer";
import "./cinematic.css";

export type CinematicViewProps = {
  destination: Destination;
  onSelect: (ref: PlaceRef) => void;
  onMap: () => void;
  onFavorite: () => void;
  isFavorite: boolean;
};

function externalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function PhotoCredit({ photo, compact = false }: { photo: Photo; compact?: boolean }) {
  const source = externalUrl(photo.sourceUrl);
  const authors = photo.attributions?.length ? photo.attributions : [{ name: photo.author, url: photo.authorUrl }];
  const sourceLabel = `${photo.source} · ${photo.license || "Consulte os termos na fonte"}`;
  return (
    <span className={`cinematic-credit${compact ? " cinematic-credit--compact" : ""}`}>
      {!compact && <span>Fotografia: </span>}
      {authors.map((author, index) => {
        const authorUrl = externalUrl(author.url);
        return <Fragment key={`${author.name}-${index}`}>{index > 0 && <span>, </span>}{authorUrl ? <a href={authorUrl} target="_blank" rel="noreferrer">{author.name || "Autor informado na fonte"}</a> : <span>{author.name || "Autoria não informada"}</span>}</Fragment>;
      })}
      <span aria-hidden="true"> · </span>
      {source ? <a href={source} target="_blank" rel="noreferrer">{sourceLabel}<ExternalLink size={9} aria-hidden="true" /></a> : <span>{sourceLabel}</span>}
    </span>
  );
}

function GoogleAttribution() {
  return <a className="cinematic-google-attribution" href="https://maps.google.com/" target="_blank" rel="noreferrer" aria-label="Dados do Google Maps"><img src="/attribution/google-maps.svg" alt="Google Maps" height={18} loading="lazy" /></a>;
}

function commonsLoader({ src, width }: ImageLoaderProps) {
  return `/api/media?${new URLSearchParams({ url: src, width: String(width) })}`;
}

function PhotoVisual({ photo, priority = false, className = "" }: { photo: Photo; priority?: boolean; className?: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const optimized = photo.source === "Wikimedia Commons";
  const sizes = priority ? "100vw" : "(max-width: 700px) 180px, (max-width: 1050px) 25vw, 20vw";
  const imageSource = optimized ? (photo.thumbnailUrl || photo.url) : priority ? photo.url : (photo.thumbnailUrl || photo.url);
  const preview = photo.thumbnailUrl && photo.thumbnailUrl !== imageSource;
  return (
    <div className={`cinematic-photo ${className} cinematic-photo--${status}`}>
      {preview && status === "loading" && (optimized
        ? <Image loader={commonsLoader} fill sizes={sizes} className="cinematic-photo-preview" src={photo.thumbnailUrl} alt="" aria-hidden="true" loading={priority ? "eager" : "lazy"} />
        : <img className="cinematic-photo-preview" src={photo.thumbnailUrl} alt="" aria-hidden="true" loading={priority ? "eager" : "lazy"} />)}
      {status !== "failed" && (optimized
        ? <Image loader={commonsLoader} fill sizes={sizes} className="cinematic-photo-image" src={imageSource} alt={photo.alt} decoding="async" fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} onLoad={() => setStatus("ready")} onError={() => setStatus("failed")} />
        : <img className="cinematic-photo-image" src={imageSource} alt={photo.alt} decoding="async" fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} onLoad={() => setStatus("ready")} onError={() => setStatus("failed")} />)}
      {status === "loading" && <span className="cinematic-photo-status" role="status">Carregando fotografia…</span>}
      {status === "failed" && <span className="cinematic-photo-unavailable" role="status"><ImageOff size={25} aria-hidden="true" /><span>Fotografia indisponível</span></span>}
    </div>
  );
}

function coordinate(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}° ${value >= 0 ? positive : negative}`;
}

function distanceLabel(meters?: number) {
  if (meters === undefined) return undefined;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function CinematicView({ destination, onSelect, onMap, onFavorite, isFavorite }: CinematicViewProps) {
  const { place, photos, nearby, facts, sources, warnings } = destination;
  const [gallery, setGallery] = useState({ destinationId: place.id, index: 0 });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nearbySection = useRef<HTMLElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const detailId = useId();
  const photoIndex = gallery.destinationId === place.id ? Math.min(gallery.index, Math.max(photos.length - 1, 0)) : 0;
  const currentPhoto = photos[photoIndex];
  const visiblePhotos = photos.slice(0, Math.min(photos.length, 3)).map((_, offset) => {
    const index = (photoIndex + offset) % photos.length;
    return { photo: photos[index], index };
  });
  const locationLabel = [place.region, place.country].filter(Boolean).join(", ") || place.address;
  const wikipediaSource = sources.find((source) => {
    const url = externalUrl(source.url);
    return url && /(^|\.)wikipedia\.org$/.test(new URL(url).hostname);
  });
  const googleAttribution = place.source === "Google Maps" || currentPhoto?.source === "Google Places";

  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
        timeline.fromTo(".cinematic-eyebrow", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.1)
          .fromTo(".cinematic-title", { autoAlpha: 0, y: 45 }, { autoAlpha: 1, y: 0, duration: 1 }, 0.16)
          .fromTo(".cinematic-intro-copy, .cinematic-actions", { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.75, stagger: 0.1 }, 0.4)
          .fromTo(".cinematic-photo-card", { autoAlpha: 0, y: 48, rotate: 2 }, { autoAlpha: 1, y: 0, rotate: 0, duration: 0.9, stagger: 0.12 }, 0.35)
          .fromTo(".cinematic-footer", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.9 }, 0.7);
      }, root);
      return () => context.revert();
    });
    return () => media.revert();
  }, [place.id]);

  useEffect(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const context = gsap.context(() => {
        gsap.fromTo(".cinematic-backdrop", { scale: 1.045, opacity: 0.35 }, { scale: 1, opacity: 1, duration: 1.35, ease: "power2.out" });
      }, root);
      return () => context.revert();
    });
    return () => media.revert();
  }, [place.id, currentPhoto?.id]);

  function selectPhoto(index: number) {
    if (!photos.length) return;
    setGallery({ destinationId: place.id, index: (index + photos.length) % photos.length });
  }

  function openDetails() {
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      setDetailsOpen(true);
    }
  }

  function onTouchEnd(event: TouchEvent) {
    const firstTouch = touchStart.current;
    touchStart.current = null;
    if (!firstTouch || !event.changedTouches.length || photos.length < 2) return;
    const horizontal = event.changedTouches[0].clientX - firstTouch.x;
    const vertical = event.changedTouches[0].clientY - firstTouch.y;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(vertical) * 1.4) selectPhoto(photoIndex + (horizontal < 0 ? 1 : -1));
  }

  function onTouchStart(event: TouchEvent) {
    // Photo strips use native horizontal scrolling; the scene itself supports swipe navigation.
    if (event.touches.length !== 1 || (event.target instanceof Element && event.target.closest("button, a, .cinematic-photo-rail"))) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function continueExploring() {
    if (nearbySection.current) {
      nearbySection.current.focus({ preventScroll: true });
      nearbySection.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    } else onMap();
  }

  return (
    <div className="cinematic" ref={root}>
      <section className={`cinematic-scene${photos.length ? "" : " cinematic-scene--no-photos"}`} aria-label={`Explore ${place.name}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null; }}>
        <div className="cinematic-backdrop" aria-hidden="true">
          {currentPhoto ? <PhotoVisual key={`${place.id}-${currentPhoto.url}`} photo={currentPhoto} priority className="cinematic-background-photo" /> : <div className="cinematic-background-empty" />}
        </div>
        <div className="cinematic-shade" />
        <div className="cinematic-topline"><span><span className="cinematic-gold-dot" /> UM MUNDO DE PERSPECTIVAS</span><span className="cinematic-topline-right">EXPLORE. DESCUBRA. SINTA.</span></div>

        <div className="cinematic-content">
          <div className="cinematic-intro">
            <p className="cinematic-eyebrow"><span className="cinematic-eyebrow-line" /><MapPin size={13} aria-hidden="true" /><span>{locationLabel || "Destino em foco"}</span></p>
            <h1 className={`cinematic-title${place.name.length > 24 ? " cinematic-title--long" : ""}`}>{place.name}</h1>
            <div className="cinematic-intro-copy">
              <p className="cinematic-summary">{destination.summary || "Ainda não há uma descrição disponível para este lugar. Explore sua localização no mapa."}</p>
              {!photos.length && <p className="cinematic-no-photos"><ImageOff size={15} aria-hidden="true" /> Nenhuma fotografia verificada disponível para este lugar.</p>}
            </div>
            <div className="cinematic-actions">
              <button className="cinematic-discover" onClick={openDetails} aria-haspopup="dialog" aria-expanded={detailsOpen}>Saiba mais <ArrowRight size={17} aria-hidden="true" /></button>
              <button className={`cinematic-favorite${isFavorite ? " cinematic-favorite--active" : ""}`} onClick={onFavorite} aria-pressed={isFavorite} aria-label={`${isFavorite ? "Remover" : "Salvar"} ${place.name} ${isFavorite ? "dos" : "nos"} favoritos`} title={isFavorite ? "Remover dos favoritos" : "Salvar nos favoritos"}><Heart size={19} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" /></button>
            </div>
          </div>

          {photos.length > 0 && <div className="cinematic-gallery" role="group" aria-roledescription="galeria" aria-label={`Fotografias de ${place.name}. Use as setas para navegar.`} tabIndex={0} onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || (event.target instanceof Element && event.target.closest("a"))) return;
            if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              // Keep keyboard focus on a stable node when the visible photo cards rotate.
              event.currentTarget.focus({ preventScroll: true });
              selectPhoto(event.key === "Home" ? 0 : event.key === "End" ? photos.length - 1 : photoIndex + (event.key === "ArrowRight" ? 1 : -1));
            }
          }}>
            <div className="cinematic-gallery-heading"><span>OUTROS OLHARES</span><span>{String(photos.length).padStart(2, "0")} {photos.length === 1 ? "FOTOGRAFIA" : "FOTOGRAFIAS"}</span></div>
            <div className="cinematic-photo-rail">
              {visiblePhotos.map(({ photo, index }, position) => <figure className={`cinematic-photo-card cinematic-photo-card--${position}${index === photoIndex ? " cinematic-photo-card--active" : ""}`} key={`${place.id}-${photo.id}`}>
                <button className="cinematic-photo-card-button" onClick={() => selectPhoto(index)} aria-label={`Ver fotografia ${index + 1} de ${place.name}: ${photo.alt}`} aria-pressed={index === photoIndex}>
                  <PhotoVisual key={photo.url} photo={photo} />
                  <span className="cinematic-card-shade" />
                  <span className="cinematic-card-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="cinematic-card-label"><span className="cinematic-card-line" /><span>{place.name}</span><small>{place.country || "Um novo olhar"}</small></span>
                  <span className="cinematic-card-expand"><Plus size={16} aria-hidden="true" /></span>
                </button>
                <figcaption><PhotoCredit photo={photo} compact /></figcaption>
              </figure>)}
            </div>
            <div className="cinematic-gallery-controls">
              <button className="cinematic-arrow" aria-label="Fotografia anterior" onClick={() => selectPhoto(photoIndex - 1)} disabled={photos.length < 2}><ArrowLeft size={18} aria-hidden="true" /></button>
              <button className="cinematic-arrow" aria-label="Próxima fotografia" onClick={() => selectPhoto(photoIndex + 1)} disabled={photos.length < 2}><ArrowRight size={18} aria-hidden="true" /></button>
              <span className="cinematic-gallery-track" aria-hidden="true"><span style={{ width: `${((photoIndex + 1) / photos.length) * 100}%` }} /></span>
              <span className="cinematic-gallery-count" aria-live="polite" aria-atomic="true"><span className="cinematic-sr-only">Fotografia {photoIndex + 1} de {photos.length}</span><strong aria-hidden="true">{String(photoIndex + 1).padStart(2, "0")}</strong><span aria-hidden="true"> / {String(photos.length).padStart(2, "0")}</span></span>
            </div>
          </div>}
        </div>

        <footer className="cinematic-footer">
          <button className="cinematic-coordinates" onClick={onMap} aria-label={`Ver ${place.name} no mapa`}><Navigation size={17} aria-hidden="true" /><span><small>ENCONTRE NO MAPA</small><span>{coordinate(place.coordinates.lat, "N", "S")}<i aria-hidden="true" />{coordinate(place.coordinates.lng, "L", "O")}</span></span><ArrowRight size={15} aria-hidden="true" /></button>
          <button className="cinematic-scroll" onClick={continueExploring}><span>{nearby.length ? "CONTINUE EXPLORANDO" : "ABRIR O MAPA"}</span><ArrowDown size={16} aria-hidden="true" /></button>
          {(currentPhoto || googleAttribution) && <div className="cinematic-current-credit">{currentPhoto && <PhotoCredit photo={currentPhoto} />}{googleAttribution && <GoogleAttribution />}</div>}
        </footer>
      </section>

      {nearby.length > 0 && <section className="cinematic-nearby" ref={nearbySection} aria-labelledby={`${detailId}-nearby`} tabIndex={-1}>
        <div className="cinematic-nearby-heading"><div><p className="cinematic-section-eyebrow">SIGA SUA CURIOSIDADE</p><h2 id={`${detailId}-nearby`}>Um pouco mais longe.</h2></div><span>{nearby.length} lugares nas proximidades</span></div>
        <div className="cinematic-nearby-grid">{nearby.map(({ place: nextPlace, photo, distanceMeters }) => <article className="cinematic-nearby-card" key={nextPlace.id}>
          <button className="cinematic-nearby-button" onClick={() => onSelect(nextPlace.ref)} aria-label={`Explorar ${nextPlace.name}`}>
            <div className="cinematic-nearby-image">{photo ? <PhotoVisual key={photo.url} photo={photo} /> : <span className="cinematic-photo-unavailable"><MapPin size={27} aria-hidden="true" /><span>Sem fotografia disponível</span></span>}<span className="cinematic-nearby-arrow"><ArrowRight size={18} aria-hidden="true" /></span></div>
            <span className="cinematic-nearby-title">{nextPlace.name}</span><span className="cinematic-nearby-meta"><span>{nextPlace.kind || nextPlace.country || nextPlace.source}</span>{distanceLabel(distanceMeters) && <span>{distanceLabel(distanceMeters)}</span>}</span>
          </button>
          {photo && <PhotoCredit photo={photo} compact />}
          {(nextPlace.source === "Google Maps" || photo?.source === "Google Places") && <GoogleAttribution />}
        </article>)}</div>
      </section>}

      <dialog className="cinematic-dialog" ref={dialog} aria-labelledby={`${detailId}-title`} onClose={() => setDetailsOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="cinematic-dialog-content">
          <button className="cinematic-dialog-close" onClick={() => dialog.current?.close()} aria-label="Fechar detalhes" autoFocus><X size={21} aria-hidden="true" /></button>
          <p className="cinematic-section-eyebrow"><Compass size={16} aria-hidden="true" /> CONHEÇA SEU PRÓXIMO DESTINO</p>
          <h2 id={`${detailId}-title`}>{place.name}</h2>
          <p className="cinematic-dialog-location"><MapPin size={15} aria-hidden="true" />{place.address || locationLabel}</p>
          <div className="cinematic-dialog-description">{(destination.description || destination.summary || "Ainda não há uma descrição disponível para este lugar.").split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {wikipediaSource && <p className="cinematic-text-attribution">Texto: <a href={externalUrl(wikipediaSource.url)} target="_blank" rel="noreferrer">Wikipédia</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>}
          {place.source === "Google Maps" && <GoogleAttribution />}
          {facts.length > 0 && <section className="cinematic-facts" aria-label="Informações sobre o destino">{facts.map((fact, index) => <div className="cinematic-fact" key={`${fact.label}-${index}`}><span>{fact.label}</span><strong>{fact.value}</strong>{externalUrl(fact.sourceUrl) && <a href={externalUrl(fact.sourceUrl)} target="_blank" rel="noreferrer">Consultar fonte <ExternalLink size={11} aria-hidden="true" /></a>}</div>)}</section>}
          {warnings.length > 0 && <div className="cinematic-warnings"><h3>Sobre as informações</h3>{warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
          {sources.length > 0 && <section className="cinematic-sources"><h3>Para ir além</h3>{sources.map((source, index) => externalUrl(source.url) ? <a key={`${source.url}-${index}`} href={externalUrl(source.url)} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={13} aria-hidden="true" /></a> : null)}</section>}
          {currentPhoto && <div className="cinematic-dialog-credit"><PhotoCredit photo={currentPhoto} /></div>}
          <button className="cinematic-discover cinematic-discover--dark" onClick={() => { dialog.current?.close(); onMap(); }}>Explorar no mapa <ArrowRight size={17} aria-hidden="true" /></button>
        </div>
      </dialog>
    </div>
  );
}

export default CinematicView;
