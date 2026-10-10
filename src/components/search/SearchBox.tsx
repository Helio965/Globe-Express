"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, MapPin, Search, X } from "lucide-react";
import { postJson, RequestGate } from "@/lib/client";
import type { PlaceRef, SearchSuggestion } from "@/types/explorer";

type SearchResponse = { suggestions: SearchSuggestion[]; provider: "google" | "wikipedia"; warnings: string[] };
export function SearchBox({ onSelect, compact = false }: { onSelect: (ref: PlaceRef, token: string) => void; compact?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(-1);
  const [retry, setRetry] = useState(0);
  const token = useRef("");
  const gate = useRef(new RequestGate());
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentGate = gate.current;
    if (query.trim().length < 2) { currentGate.cancel(); return; }
    const request = currentGate.begin();
    const timer = setTimeout(async () => {
      setBusy(true); setError("");
      token.current ||= crypto.randomUUID();
      try {
        const result = await postJson<SearchResponse>("/api/search", { query: query.trim(), sessionToken: token.current }, request.signal);
        if (request.isCurrent()) { setData(result); setIndex(-1); }
      } catch (failure) {
        if (request.isCurrent()) setError(failure instanceof Error ? failure.message : "A pesquisa está indisponível.");
      } finally { if (request.isCurrent()) setBusy(false); }
    }, 350);
    return () => { clearTimeout(timer); currentGate.cancel(); };
  }, [query, retry]);

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function choose(suggestion: SearchSuggestion) {
    gate.current.cancel(); setBusy(false); setOpen(false); setData(undefined); setQuery("");
    onSelect(suggestion.ref, token.current); token.current = "";
  }
  const expanded = open && query.trim().length >= 2;
  const activeOption = expanded && index >= 0 && index < (data?.suggestions.length ?? 0);
  return <div className={`search-box ${compact ? "search-compact" : ""}`} ref={wrapper}>
    <div className="search-input-wrap">
      <Search size={20} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>Pesquisar qualquer lugar do mundo</label>
      <input id={id} type="search" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-results` : undefined} aria-activedescendant={activeOption ? `${id}-option-${index}` : undefined} autoComplete="off" maxLength={180}
        placeholder={compact ? "Qual será a próxima descoberta?" : "Pesquisar qualquer lugar do mundo…"} value={query}
        onChange={event => { setQuery(event.target.value); setData(undefined); setError(""); setBusy(event.target.value.trim().length >= 2); setIndex(-1); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={event => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setIndex(previous => Math.min(previous + 1, (data?.suggestions.length ?? 0) - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setIndex(previous => data?.suggestions.length ? Math.max(0, previous - 1) : -1); }
          if (event.key === "Enter" && data?.suggestions.length) { event.preventDefault(); choose(data.suggestions[Math.max(0, index)]); }
        }} />
      {busy && query.length >= 2 ? <LoaderCircle className="spin" size={19} aria-label="Pesquisando" /> : query ? <button type="button" className="search-clear" aria-label="Limpar pesquisa" onClick={() => { setQuery(""); setData(undefined); setBusy(false); }}><X size={18} /></button> : <span className="search-enter"><ArrowUpRight size={21} /></span>}
    </div>
    {expanded && <div className="search-popover">
      <div role="status" className="search-status">{busy ? "Buscando lugares reais…" : error || (data?.suggestions.length === 0 ? "Nenhum lugar encontrado. Tente outro nome ou região." : "ESCOLHA SEU PRÓXIMO DESTINO")}</div>
      {error && <button className="text-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>}
      <ul role="listbox" id={`${id}-results`} aria-label="Resultados da pesquisa">
        {data?.suggestions.map((item, itemIndex) => <li key={`${item.ref.provider}-${item.label}-${itemIndex}`} role="option" aria-selected={itemIndex === index} id={`${id}-option-${itemIndex}`} onPointerMove={() => setIndex(itemIndex)} onPointerDown={event => { event.preventDefault(); choose(item); }}>
          <MapPin size={18} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowUpRight size={16} aria-hidden="true" />
        </li>)}
      </ul>
      {data && <div className="search-attribution">{data.provider === "google" ? <>
        {/* Provider logo must remain visible for Google suggestions outside a map. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="google-maps-logo" src="/attribution/google-maps.svg" height="18" alt="Google Maps" />
      </> : "Resultados geográficos da Wikipedia"}{data.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    </div>}
  </div>;
}
