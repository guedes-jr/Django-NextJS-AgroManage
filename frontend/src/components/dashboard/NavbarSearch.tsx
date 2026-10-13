"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { useOrganizationAccess } from "@/components/auth/OrganizationAccessContext";
import { searchNavbar, type NavbarSearchResult } from "@/services/navbarSearch";
import styles from "./NavbarSearch.module.css";

const BatchSheet = dynamic(() => import("@/components/animal/BatchTechnicalSheetModal").then(module => module.BatchTechnicalSheetModal));

export function NavbarSearch() {
  const router = useRouter();
  const access = useOrganizationAccess();
  const allowed = !!access && (access.role !== "operator" || !!access.livestock_species?.length);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<{ query: string; items: NavbarSearchResult[]; error: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [selected, setSelected] = useState<NavbarSearchResult | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const speciesScope = access?.livestock_species?.join(",");
  const lookupKey = `${access?.role}:${speciesScope}:${access?.can_operate_crops}:${term}`;
  const ready = response?.query === lookupKey;
  const items = ready ? response.items : [];
  const loading = allowed && term.length >= 2 && !ready;

  useEffect(() => {
    if (!allowed || !access || term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchNavbar(term, controller.signal, access).then(items => {
        if (!controller.signal.aborted) setResponse({ query: lookupKey, items, error: false });
      }).catch(() => {
        if (!controller.signal.aborted) setResponse({ query: lookupKey, items: [], error: true });
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, allowed, lookupKey, access]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const choose = (result: NavbarSearchResult) => {
    if (result.href) router.push(result.href);
    else setSelected(result);
    setOpen(false);
  };
  const closeSheet = () => { setSelected(null); input.current?.focus(); };

  return <>
    <div ref={wrapper} className={styles.wrapper} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className={`search-input-wrapper ${styles.input}`}>
        <Search size={19} aria-hidden="true" />
        <input ref={input} type="search" role="combobox" aria-label="Buscar animais, lotes, estoque e estruturas"
          aria-autocomplete="list" aria-expanded={open && allowed} aria-controls="navbar-search-results"
          aria-activedescendant={open && items[highlight] ? `navbar-search-${highlight}` : undefined}
          placeholder="Buscar animais, estoque, estruturas..." value={query} disabled={!allowed}
          title={!allowed ? "Pesquisa disponível para usuários com acesso a rebanhos" : undefined}
          onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setHighlight(-1); }}
          onKeyDown={event => {
            if (event.key === "Escape") { setOpen(false); return; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setHighlight(index => items.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length : -1);
            }
            if (event.key === "Enter") {
              event.preventDefault();
              if (items[highlight >= 0 ? highlight : 0]) choose(items[highlight >= 0 ? highlight : 0]);
            }
          }} />
        {query && <button type="button" aria-label="Limpar pesquisa" onClick={() => { setQuery(""); setHighlight(-1); input.current?.focus(); }}><X size={16} /></button>}
      </div>
      {open && allowed && <div className={styles.dropdown}>
        <div className={styles.heading}>Pesquisa da fazenda <span>Até 5 resultados por tipo</span></div>
        <div role="status" className={styles.status} hidden={term.length >= 2 && !loading && !response?.error && items.length > 0}>
          {term.length < 2 ? "Digite pelo menos 2 caracteres para pesquisar." : loading ? <><Loader2 size={16} className={styles.spinner} /> Buscando...</> : response?.error ? "Não foi possível pesquisar. Altere o termo para tentar novamente." : "Nenhum resultado encontrado."}
        </div>
        <div id="navbar-search-results" role="listbox" aria-label="Resultados da pesquisa">
          {items.map((item, index) => <button type="button" role="option" id={`navbar-search-${index}`} aria-selected={highlight === index}
            key={`${item.kind}-${item.id}`} className={`${styles.result} ${highlight === index ? styles.highlight : ""}`}
            onPointerDown={event => event.preventDefault()} onClick={() => choose(item)}>
            <span className={styles.kind}>{({ animal: "Animal", batch: "Lote", inventory: "Estoque", structure: "Estrutura" })[item.kind]}</span>
            <span><strong>{item.label}</strong><small>{item.species}{item.farm ? ` · ${item.farm}` : ""}</small></span>
          </button>)}
        </div>
        <div className={styles.footer}>Selecione um resultado para consultar seus detalhes.</div>
      </div>}
    </div>
    {selected?.kind === "batch" && <BatchSheet isOpen batchId={selected.id} onClose={closeSheet} />}
  </>;
}
