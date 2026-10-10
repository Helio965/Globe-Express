'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, LoaderCircle, RotateCcw, Search, X } from 'lucide-react';
import usePlaceSearch from '@/hooks/use-place-search';
import type { PlaceReference, SearchSuggestion } from '@/types/explorer';

interface SearchBoxProps {
  onSelect: (reference: PlaceReference, sessionToken?: string) => void;
  disabled?: boolean;
  provider: 'google' | 'open';
}

export default function SearchBox({ onSelect, disabled = false, provider }: SearchBoxProps) {
  const search = usePlaceSearch(provider);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const resultsId = `${id}-results`;
  const active = activeIndex < search.suggestions.length ? activeIndex : -1;
  const popupVisible = open && !disabled && Boolean(search.query.trim()) && !search.committed;
  const hasGoogleResults = search.suggestions.some((suggestion) => suggestion.reference.provider === 'google');
  const { abandonSearch } = search;

  useEffect(() => {
    const handleOutside = (event: PointerEvent) => {
      if (open && root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
        abandonSearch();
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, [abandonSearch, open]);

  function selectSuggestion(suggestion: SearchSuggestion) {
    const token = search.sessionToken;
    search.finishSelection(suggestion.title);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(suggestion.reference, token);
  }

  const announcement = search.status === 'loading'
    ? 'Buscando lugares'
    : search.status === 'ready'
      ? `${search.suggestions.length} resultados disponíveis`
      : search.status === 'empty'
        ? 'Nenhum lugar encontrado'
        : '';

  return (
    <div className="search-box" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        setOpen(false);
        abandonSearch();
      }
    }}>
      <div className="search-field">
        <Search className="search-icon" size={19} aria-hidden="true" />
        <label className="search-sr-only" htmlFor={`${id}-input`}>Buscar lugares pelo mundo</label>
        <input
          ref={input}
          id={`${id}-input`}
          className="search-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder="Para onde vamos?"
          disabled={disabled}
          value={search.query}
          aria-autocomplete="list"
          aria-expanded={popupVisible}
          aria-controls={popupVisible ? resultsId : undefined}
          aria-activedescendant={popupVisible && active >= 0 ? `${id}-option-${active}` : undefined}
          onFocus={() => {
            setOpen(true);
            if (search.committed && search.query.trim()) search.setQuery(search.query);
          }}
          onChange={(event) => {
            search.setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              search.abandonSearch();
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              if (search.suggestions.length) {
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                setActiveIndex((previous) => previous < 0
                  ? direction === 1 ? 0 : search.suggestions.length - 1
                  : (previous + direction + search.suggestions.length) % search.suggestions.length);
              }
              return;
            }
            if (event.key === 'Enter' && popupVisible && active >= 0) {
              event.preventDefault();
              selectSuggestion(search.suggestions[active]);
            }
          }}
        />
        {search.status === 'loading' && <LoaderCircle className="search-spinner" size={18} aria-hidden="true" />}
        {search.query && (
          <button
            className="search-clear"
            type="button"
            aria-label="Limpar busca"
            disabled={disabled}
            onClick={() => {
              search.setQuery('');
              setActiveIndex(-1);
              input.current?.focus();
            }}
          ><X size={17} aria-hidden="true" /></button>
        )}
      </div>

      <span className="search-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>

      {popupVisible && (
        <div className="search-results">
          <div id={resultsId} role="listbox" aria-label="Lugares encontrados" aria-busy={search.status === 'loading'}>
            {search.suggestions.map((suggestion, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-option-${index}`}
                key={`${suggestion.reference.provider}-${'id' in suggestion.reference ? suggestion.reference.id : suggestion.title}`}
                aria-selected={active === index}
                className={`search-result${active === index ? ' is-active' : ''}`}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span className="search-result-copy">
                  <span className="search-result-title">{suggestion.title}</span>
                  <span className="search-result-subtitle">{suggestion.subtitle}</span>
                </span>
                <span className="search-source">{suggestion.reference.provider === 'google' ? 'Google' : suggestion.reference.provider === 'wikipedia' ? 'Wikipédia' : 'Coordenadas'}</span>
                <ArrowUpRight size={16} className="search-result-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
          {search.query.trim().length < 2 && <p className="search-message">Digite pelo menos 2 caracteres para buscar.</p>}
          {search.status === 'loading' && <p className="search-message">Encontrando seu próximo destino…</p>}
          {search.status === 'empty' && <p className="search-message">Nenhum lugar encontrado. Tente outro nome ou país.</p>}
          {search.status === 'error' && <div className="search-error-state"><p className="search-message search-message-error" role="alert">{search.error}</p><button type="button" className="search-retry" disabled={Boolean(search.retryAfter)} onMouseDown={(event) => event.preventDefault()} onClick={search.retry}><RotateCcw size={14} aria-hidden="true" />{search.retryAfter ? 'Aguarde um instante' : 'Tentar novamente'}</button></div>}
          {hasGoogleResults && (
            <div className="search-google-attribution">
              <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" width={120} height={14} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
