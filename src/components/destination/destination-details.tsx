'use client';

import { ExternalLink, MapPin, BookOpen, Camera, Info } from 'lucide-react';
import Dialog from '@/components/ui/dialog';
import type { Destination, Location, Photo } from '@/types/explorer';

export function LocationCredit({ location }: { location: Location }) {
  return <span>{location.attributions.map((attribution, index) => <span key={`${attribution}-${index}`}>{index > 0 && ' · '}{attribution === 'Google Maps' ? <span className="google-maps-attribution" translate="no">Google Maps</span> : attribution}</span>)}</span>;
}

export function PhotoCredit({ photo }: { photo: Photo }) {
  const authors = photo.authorAttributions?.length ? photo.authorAttributions : [{ name: photo.author, url: photo.authorUrl }];
  return (
    <div className="photo-credit">
      <Camera size={13} aria-hidden="true" />
      <span>{photo.provider === 'google' && <><span className="google-maps-attribution" translate="no">Google Maps</span><span className="credit-separator"> · </span></>}Fotografia por {authors.map((author, index) => <span key={`${author.name}-${index}`}>{index > 0 && ', '}{author.url ? <a href={author.url} target="_blank" rel="noopener noreferrer">{author.name}</a> : author.name}</span>)}<span className="credit-separator"> · </span>{photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}<span className="credit-separator"> · </span><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">Ver fotografia</a></span>
    </div>
  );
}

export default function DestinationDetails({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const { location } = destination;
  return (
    <Dialog title={location.name} description={[location.region, location.country].filter(Boolean).join(' · ') || location.address} onClose={onClose} className="destination-dialog">
      <div className="dialog-content">
        <div className="details-coordinate"><MapPin size={16} /><span>{location.coordinates.lat.toFixed(5)}°, {location.coordinates.lng.toFixed(5)}°</span>{location.sourceUrl && <a className="text-link" href={location.sourceUrl} target="_blank" rel="noopener noreferrer">Ver localização <ExternalLink size={13} /></a>}</div>
        {destination.summary ? <p className="details-lead">{destination.summary}</p> : <div className="empty-note"><Info size={19} /><p>A localização foi identificada, mas ainda não encontramos um resumo confiável para este ponto.</p></div>}
        {destination.facts.length > 0 && <dl className="facts-grid">{destination.facts.map((fact, index) => <div className="fact" key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd><a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Fonte: ${fact.label}`}>Consultar fonte <ExternalLink size={12} /></a></div>)}</dl>}
        {destination.sections.map((section, index) => <section className="content-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><p>{section.text}</p></section>)}
        {destination.warnings.length > 0 && <aside className="service-warnings" aria-label="Informações sobre os dados disponíveis">{destination.warnings.map((warning, index) => <p key={`${warning.service}-${index}`}><Info size={15} /><span>{warning.message}</span></p>)}</aside>}
        {destination.photos.length > 0 && <section className="source-section"><h3><Camera size={17} /> Créditos das fotografias</h3>{destination.photos.map(photo => <PhotoCredit key={photo.id} photo={photo} />)}</section>}
        <section className="source-section"><h3><BookOpen size={17} /> Fontes &amp; referências</h3>{destination.sources.length > 0 ? <ul className="sources-list">{destination.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}<ExternalLink size={14} /></a></li>)}</ul> : <p className="muted">Não há fontes editoriais adicionais para este ponto.</p>}{location.attributions.length > 0 && <p className="data-attribution">Dados da localização: <LocationCredit location={location} /></p>}</section>
      </div>
    </Dialog>
  );
}
