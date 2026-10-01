"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus, ScanLine } from "lucide-react";

export function TechnicalSheetPreview({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scale = isMobile ? zoom ?? fitScale : 1;

  useEffect(() => {
    const viewport = viewportRef.current;
    const paper = paperRef.current;
    if (!viewport || !paper) return;
    const resize = () => {
      setIsMobile(window.matchMedia("(max-width: 767.98px)").matches);
      const sheet = paper.querySelector<HTMLElement>(".ficha-lote-paper");
      if (!sheet) return;
      const width = Math.max(sheet.offsetWidth, sheet.scrollWidth);
      setFitScale(Math.min(1, Math.max(1, viewport.clientWidth - 24) / width));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    observer.observe(paper);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="technical-sheet-preview">
      <div className="technical-sheet-toolbar d-flex flex-wrap align-items-center justify-content-between gap-2 p-2 border-bottom">
        <span className="small text-muted">Prévia da ficha · amplie para ler os detalhes</span>
        <div className="d-flex align-items-center gap-2" role="group" aria-label="Zoom da ficha técnica">
          <button type="button" className="btn btn-sm btn-light" aria-label="Diminuir zoom" disabled={scale <= 0.25} onClick={() => setZoom(Math.max(0.25, scale - 0.25))}><Minus size={16} /></button>
          <output className="small" aria-live="polite">{Math.round(scale * 100)}%</output>
          <button type="button" className="btn btn-sm btn-light" aria-label="Aumentar zoom" disabled={scale >= 2} onClick={() => setZoom(Math.min(2, scale + 0.25))}><Plus size={16} /></button>
          <button type="button" className="btn btn-sm btn-light d-flex align-items-center gap-1" onClick={() => setZoom(null)}><ScanLine size={16} /> Ajustar à tela</button>
        </div>
      </div>
      <div ref={viewportRef} className="technical-sheet-viewport">
        <div className="print-container-wrapper technical-sheet-canvas" style={{ zoom: scale }}>
          <div ref={paperRef} className="technical-sheet-paper">{children}</div>
        </div>
      </div>
      <style>{`
        .technical-sheet-toolbar { position: sticky; top: 0; z-index: 1; background: var(--background); }
        .technical-sheet-viewport { overflow-x: auto; padding: 12px; background: #e9ecef; }
        .technical-sheet-canvas { width: max-content; margin-inline: auto; }
        .technical-sheet-paper { width: 210mm; }
        @media screen and (min-width: 768px) {
          .technical-sheet-toolbar { display: none !important; }
          .technical-sheet-viewport { padding: 16px; }
        }
        @media print {
          .technical-sheet-toolbar { display: none !important; }
          .technical-sheet-viewport { overflow: visible !important; padding: 0 !important; background: white !important; }
          .technical-sheet-canvas { zoom: 1 !important; }
          .technical-sheet-paper { width: auto !important; }
        }
      `}</style>
    </div>
  );
}
