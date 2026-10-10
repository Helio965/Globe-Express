'use client';

import { ArrowUpRight, MapPin } from 'lucide-react';
import PhotoFrame from './photo-frame';
import { PhotoCredit } from './destination-details';
import type { NearbyPlace, PlaceReference } from '@/types/explorer';

export default function NearbyPlaces({ places, onSelect }: { places: NearbyPlace[]; onSelect: (reference: PlaceReference) => void }) {
  if (!places.length) return null;
  return (
    <section className="nearby-section" id="nearby-places" aria-labelledby="nearby-title">
      <div className="nearby-heading"><div><span className="eyebrow">A DESCOBERTA CONTINUA</span><h2 id="nearby-title">Logo ali, outro mundo.</h2></div><p>Lugares próximos ao ponto que você escolheu.<br />Siga a curiosidade.</p></div>
      <div className="nearby-grid">{places.map((place, index) => <article className="nearby-card" key={`${place.location.name}-${index}`}>
        <button type="button" className="nearby-card-select" onClick={() => onSelect(place.location.reference)} aria-label={`Explorar ${place.location.name}`}>
          {place.photo ? <PhotoFrame key={place.photo.id} photo={place.photo} thumbnail sizes="(max-width: 640px) 90vw, 30vw" /> : <div className="nearby-map-art" aria-label="Fotografia não disponível"><MapPin size={38} /><span>Explore a localização</span></div>}
          <span className="nearby-card-shade" />
          <span className="nearby-card-top"><span>{String(index + 1).padStart(2, '0')}</span><ArrowUpRight size={21} /></span>
          <span className="nearby-card-copy"><span className="nearby-kind">{place.distanceKm !== undefined ? `${place.distanceKm < 1 ? (place.distanceKm * 1000).toFixed(0) + ' m' : place.distanceKm.toFixed(1) + ' km'} de distância` : 'Nas proximidades'}</span><span className="nearby-name">{place.location.name}</span><span className="nearby-region">{[place.location.region, place.location.country].filter(Boolean).join(' · ') || 'Ver informações e fontes'}</span></span>
        </button>
        {place.photo && <div className="nearby-photo-credit"><PhotoCredit photo={place.photo} /></div>}
      </article>)}</div>
      <footer className="site-footer"><a className="footer-brand" href="#top">World Explorer<span>Um novo olhar sobre o mundo.</span></a><div><a href="/privacy">Privacidade</a><a href="/terms">Termos de uso</a><span>Feito para os curiosos.</span></div></footer>
    </section>
  );
}
