'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Heart, Map, MapPin, MoveUpRight } from 'lucide-react';
import gsap from 'gsap';
import GlobeArt from '@/components/ui/globe-art';
import PhotoFrame from './photo-frame';
import { LocationCredit, PhotoCredit } from './destination-details';
import type { Destination } from '@/types/explorer';

interface CinematicHeroProps {
  destination: Destination;
  isFavorite: boolean;
  onFavorite: () => void;
  onDetails: () => void;
  onMap: () => void;
}

export default function CinematicHero({ destination, isFavorite, onFavorite, onDetails, onMap }: CinematicHeroProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const sceneRef = useRef<HTMLDivElement>(null);
  const { location, photos } = destination;
  const currentPhoto = photos[photoIndex];
  const nextPhotos = Array.from({ length: Math.min(2, Math.max(0, photos.length - 1)) }, (_, offset) => (photoIndex + offset + 1) % photos.length);
  const changePhoto = (direction: number) => setPhotoIndex(index => (index + direction + photos.length) % photos.length);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo('[data-reveal]', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.09, ease: 'power3.out', clearProps: 'all' });
    }, sceneRef);
    return () => context.revert();
  }, []);

  return (
    <div className={`cinematic-hero ${currentPhoto ? '' : 'cinematic-without-photo'}`} ref={sceneRef}>
      <div className="cinematic-backdrop">
        {currentPhoto ? <PhotoFrame key={currentPhoto.id} photo={currentPhoto} className="hero-photograph" priority /> : <div className="abstract-landscape"><GlobeArt compact /><span className="abstract-caption">VISUALIZAÇÃO GEOGRÁFICA · FOTOGRAFIAS NÃO DISPONÍVEIS</span></div>}
      </div>
      <div className="cinematic-shade" />
      <div className="hero-copy destination-copy">
        <div className="destination-eyebrow eyebrow" data-reveal><span className="eyebrow-line" />{[location.region, location.country].filter(Boolean).join(' / ') || 'UMA NOVA PERSPECTIVA'}</div>
        <h1 className={`destination-name ${location.name.length > 27 ? 'long-name' : ''}`} data-reveal>{location.name}</h1>
        <div className="destination-coordinate" data-reveal><MapPin size={15} aria-hidden="true" /><span>{Math.abs(location.coordinates.lat).toFixed(3)}° {location.coordinates.lat >= 0 ? 'N' : 'S'} &nbsp; / &nbsp; {Math.abs(location.coordinates.lng).toFixed(3)}° {location.coordinates.lng >= 0 ? 'E' : 'W'}</span></div>
        <p className="hero-description" data-reveal>{destination.summary || 'Cada ponto do mapa abre uma nova possibilidade. Explore a localização e consulte as fontes disponíveis para este lugar.'}</p>
        <div className="hero-actions" data-reveal>
          <button className="button button-primary" type="button" onClick={onDetails}>Conheça este lugar <MoveUpRight size={19} /></button>
          <button className={`icon-button favorite-button ${isFavorite ? 'is-favorite' : ''}`} type="button" onClick={onFavorite} aria-label={isFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'} aria-pressed={isFavorite}><Heart size={21} fill={isFavorite ? 'currentColor' : 'none'} /></button>
        </div>
        {destination.warnings.length > 0 && <p className="hero-data-note" data-reveal>Algumas informações não estão disponíveis. <button type="button" onClick={onDetails}>Ver detalhes</button></p>}
      </div>
      {nextPhotos.length > 0 && <div className="photo-rail" aria-label="Outras fotografias deste lugar" data-reveal>{nextPhotos.map((index, offset) => <div className={`photo-preview-wrap photo-preview-wrap-${offset}`} key={photos[index].id}><button className={`photo-preview photo-preview-${offset}`} type="button" onClick={() => setPhotoIndex(index)} aria-label={`Ver fotografia ${index + 1} de ${photos.length}: ${photos[index].alt}`}><PhotoFrame key={photos[index].id} photo={photos[index]} thumbnail sizes="(max-width: 640px) 110px, 180px" /><span className="photo-preview-shade" /><span className="photo-preview-index">{String(index + 1).padStart(2, '0')}</span><span className="photo-preview-label">Outra perspectiva<ArrowRight size={18} /></span></button><div className="thumbnail-credit"><PhotoCredit photo={photos[index]} /></div></div>)}</div>}
      <div className="cinematic-footer">
        <div className="photo-navigation">
          {photos.length > 0 ? <><div className="photo-counter"><span>{String(photoIndex + 1).padStart(2, '0')}</span><span className="photo-counter-divider" /><span>{String(photos.length).padStart(2, '0')}</span></div><div className="photo-progress" aria-hidden="true">{photos.map((photo, index) => <span key={photo.id} className={index === photoIndex ? 'is-active' : ''} />)}</div>{photos.length > 1 && <div className="photo-arrows"><button className="icon-button" type="button" onClick={() => changePhoto(-1)} aria-label="Fotografia anterior"><ArrowLeft size={18} /></button><button className="icon-button" type="button" onClick={() => changePhoto(1)} aria-label="Próxima fotografia"><ArrowRight size={18} /></button></div>}</> : <span className="eyebrow">EXPLORAR É MUDAR DE PERSPECTIVA</span>}
          <span className="sr-only" aria-live="polite">{currentPhoto ? `Fotografia ${photoIndex + 1} de ${photos.length}. ${currentPhoto.alt}` : 'Não há fotografias disponíveis para este ponto.'}</span>
        </div>
        <button type="button" className="map-shortcut" onClick={onMap}><Map size={16} /> Ver no mapa <MoveUpRight size={14} /></button>
      </div>
      <div className="hero-photo-credit">{currentPhoto && <PhotoCredit photo={currentPhoto} />}<p className="scene-location-attribution"><LocationCredit location={location} /></p></div>
      {destination.nearby.length > 0 && <button className="scroll-discover" type="button" onClick={() => document.getElementById('nearby-places')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Continue a descoberta <ArrowDown size={15} /></button>}
    </div>
  );
}
