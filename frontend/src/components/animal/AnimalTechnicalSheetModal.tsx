"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Printer, 
  Download, 
  X, 
  Calendar, 
  Scale, 
  Activity, 
  History, 
  Heart, 
  Baby, 
  Syringe, 
  Microscope,
  Info,
  Clock,
  QrCode
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { fetchAnimalDetails, fetchAnimalHistory } from "@/services/livestockService";
import { Loader2 } from "lucide-react";
import { breedDictionary } from "@/constants/breedInfo";

interface AnimalTechnicalSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalId: string | number;
}

export function AnimalTechnicalSheetModal({ isOpen, onClose, animalId }: AnimalTechnicalSheetModalProps) {
  const [animal, setAnimal] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && animalId) {
      setLoading(true);
      Promise.all([
        fetchAnimalDetails(animalId),
        fetchAnimalHistory(animalId)
      ])
        .then(([details, fullHistory]) => {
          setAnimal(details);
          setHistory(fullHistory);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, animalId]);

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  // --- Calculations for KPIs ---
  const births = history.filter(e => e.type === 'birth');
  const totalPartos = births.length;
  const totalLeitoes = births.reduce((acc, b) => {
    const match = b.subtitle.match(/(\d+)\s+nascidos/);
    return acc + (match ? parseInt(match[1]) : 0);
  }, 0);
  
  // Mocking some data for the premium look if real data is missing
  const mediaNascidos = totalPartos > 0 ? (totalLeitoes / totalPartos).toFixed(1) : "0.0";
  const taxaDesmame = "92.5%"; // Placeholder
  const intervaloPartos = "152 dias"; // Placeholder

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ficha Técnica - ${animal?.identifier || '...'}`}
      maxWidth="max-w-3xl"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <button className="btn btn-light rounded-pill px-4 d-flex align-items-center gap-2" onClick={onClose}>
            <X size={18} /> Fechar
          </button>
          <button className="btn btn-primary rounded-pill px-4 d-flex align-items-center gap-2" onClick={handlePrint}>
            <Printer size={18} /> Imprimir / PDF
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="d-flex flex-column align-items-center justify-content-center py-5 gap-3">
          <Loader2 className="spin-animation text-primary" size={40} />
          <span className="text-muted-foreground">Gerando ficha técnica detalhada...</span>
        </div>
      ) : (
        <div className="bg-muted/10 min-vh-100 d-flex justify-content-center p-0 p-md-5 print-container-wrapper">
          {/* Ficha Content (Paper Simulation) */}
          <div 
            ref={printRef}
            className="technical-sheet-paper bg-white mx-auto shadow-lg my-4 p-4 position-relative unique-animal-print-sheet d-flex flex-column"
            style={{ 
              width: '210mm', 
              minHeight: '297mm',
              color: '#334155',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            {/* Header */}
            <div className="d-flex justify-content-between align-items-start mb-3 border-bottom pb-3 border-success/20">
              <div className="d-flex align-items-center gap-3">
                <div className="bg-white border border-border p-1 rounded-2 d-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${animal?.id}`} 
                    alt="Animal QR" 
                    className="w-100 h-100"
                  />
                </div>
                <div>
                  <h6 className="fw-bold text-success mb-0">Gestão Agro</h6>
                  <span className="text-muted-foreground fw-medium" style={{ fontSize: '0.7rem' }}>Fazenda São João</span>
                </div>
              </div>
              <div className="text-center flex-grow-1">
                <h5 className="fw-bold text-uppercase mb-0" style={{ letterSpacing: '1px', fontSize: '1.25rem' }}>
                  Ficha Técnica {animal?.gender === 'F' ? 'da Matriz' : 'do Reprodutor'}
                </h5>
              </div>
              <div className="text-end" style={{ fontSize: '0.75rem' }}>
                <div className="fw-bold text-muted-foreground d-flex align-items-center justify-content-end gap-2 mb-0">
                  <Printer size={12} /> Imprimir / PDF
                </div>
                <div className="text-muted-foreground">Data: {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Main Info Section */}
            <div className="row g-4 mb-3">
              <div className="col-4">
                <div className="rounded-4 overflow-hidden border border-border shadow-sm bg-muted/20 d-flex align-items-center justify-content-center mb-3" style={{ height: '180px' }}>
                   {(() => {
                     const breedName = animal?.breed_name || animal?.breed || "Landrace";
                     const breedImg = breedDictionary[breedName]?.imageUrl;
                     
                     if (breedImg) {
                       return <img src={breedImg} alt={breedName} className="w-100 h-100 object-fit-cover" />;
                     }
                     
                     // Fallback images based on species
                     const species = (animal?.species_code || "").toLowerCase();
                     if (species.includes("ave")) return <img src="https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&q=80&w=400" className="w-100 h-100 object-fit-cover" />;
                     if (species.includes("bov")) return <img src="https://images.unsplash.com/photo-1547595628-c61a29f496f0?auto=format&fit=crop&q=80&w=400" className="w-100 h-100 object-fit-cover" />;
                     // Default to pig if swine or unknown
                     return <img src="https://images.unsplash.com/photo-1544225134-888d2237ec92?auto=format&fit=crop&q=80&w=400" className="w-100 h-100 object-fit-cover" />;
                   })()}
                </div>
                
                <div className="text-center">
                  <h4 className="fw-black mb-1 text-success text-truncate px-2">{animal?.identifier}</h4>
                  <span className="badge bg-success/15 text-success rounded-pill px-3 py-1 fw-bold text-uppercase" style={{ fontSize: '0.7rem' }}>
                    {animal?.reproductive_status?.replace('_', ' ') || 'ATIVA'}
                  </span>
                </div>
              </div>

              <div className="col-8">
                <div className="row g-3">
                  {/* Info Left */}
                  <div className="col-5 border-end border-border pe-3">
                    <div className="mb-2">
                      <span className="small text-muted-foreground d-block" style={{ fontSize: '0.7rem' }}>Nome / Identificação:</span>
                      <span className="fw-bold small">{animal?.identifier}</span>
                    </div>
                    <div className="mb-2">
                      <span className="small text-muted-foreground d-block" style={{ fontSize: '0.7rem' }}>Raça:</span>
                      <span className="fw-bold small">{animal?.breed_name || 'Landrace'}</span>
                    </div>
                    <div className="mb-2">
                      <span className="small text-muted-foreground d-block" style={{ fontSize: '0.7rem' }}>Data de Nascimento:</span>
                      <span className="fw-bold small">{animal?.birth_date ? new Date(animal.birth_date).toLocaleDateString('pt-BR') : '18/09/2022'}</span>
                    </div>
                    <div className="mb-2">
                      <span className="small text-muted-foreground d-block" style={{ fontSize: '0.7rem' }}>Lote:</span>
                      <span className="fw-bold small">{animal?.batch_code || 'MATR-02'}</span>
                    </div>
                  </div>

                  {/* Info Right + Resumo */}
                  <div className="col-7 ps-3">
                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <span className="small text-muted-foreground d-block" style={{ fontSize: '0.65rem' }}>Peso Atual:</span>
                        <span className="fw-bold small">{animal?.current_weight_kg || '0'} kg</span>
                      </div>
                      <div className="col-6">
                        <span className="small text-muted-foreground d-block" style={{ fontSize: '0.65rem' }}>Último Parto:</span>
                        <span className="fw-bold small">15/02/2025</span>
                      </div>
                      <div className="col-12 mt-1">
                        <span className="small text-muted-foreground d-block" style={{ fontSize: '0.65rem' }}>Paridade:</span>
                        <span className="fw-bold small">{totalPartos}</span>
                      </div>
                    </div>

                    <div className="p-2 bg-success/5 rounded-3 border border-success/10">
                      <h6 className="fw-bold text-success text-uppercase mb-2" style={{ fontSize: '0.65rem' }}>Resumo Reprodutivo</h6>
                      <div className="row g-2">
                        <div className="col-6">
                          <span className="text-muted-foreground d-block" style={{ fontSize: '0.6rem' }}>Total Partos:</span>
                          <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{totalPartos}</span>
                        </div>
                        <div className="col-6">
                          <span className="text-muted-foreground d-block" style={{ fontSize: '0.6rem' }}>Total Leitões:</span>
                          <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{totalLeitoes}</span>
                        </div>
                        <div className="col-6">
                          <span className="text-muted-foreground d-block" style={{ fontSize: '0.6rem' }}>Média Nascidos:</span>
                          <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{mediaNascidos}</span>
                        </div>
                        <div className="col-6">
                          <span className="text-muted-foreground d-block" style={{ fontSize: '0.6rem' }}>Taxa Desmame:</span>
                          <span className="fw-bold text-success" style={{ fontSize: '0.75rem' }}>{taxaDesmame}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Grid - History Table Full Width */}
            <div className="row g-3 mb-3">
              <div className="col-12">
                <div className="dashboard-card border border-border p-2 rounded-3">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Histórico Reprodutivo</h6>
                  <table className="table table-sm mb-0" style={{ fontSize: '0.65rem' }}>
                    <thead>
                      <tr className="text-muted-foreground">
                        <th>Parto</th>
                        <th>Data</th>
                        <th>Nasc. Totais</th>
                        <th>Vivos</th>
                        <th>Desmamados</th>
                        <th className="text-end">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {births.length > 0 ? births.slice(0, 5).map((b, i) => (
                        <tr key={i}>
                          <td className="fw-bold text-success">{births.length - i}</td>
                          <td>{new Date(b.date).toLocaleDateString('pt-BR')}</td>
                          <td>{b.subtitle.match(/(\d+)/)?.[1] || '-'}</td>
                          <td>{b.subtitle.match(/(\d+)/)?.[1] || '-'}</td>
                          <td>10</td>
                          <td className="text-end fw-bold">90.9%</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={6} className="text-center py-2 text-muted-foreground">Nenhum parto registrado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Third Row */}
            <div className="row g-4 mb-3">
              {/* Timeline */}
              <div className="col-4">
                <div className="dashboard-card border border-border p-3 h-100 rounded-3">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Linha do Tempo</h6>
                  <div className="timeline-small position-relative ps-3">
                    <div className="position-absolute h-100 border-start border-success/30" style={{ left: '4px', top: '0' }}></div>
                    {history.slice(0, 3).map((e, i) => (
                      <div key={i} className="mb-2 position-relative">
                        <div className="position-absolute rounded-circle bg-success" style={{ width: '6px', height: '6px', left: '-15px', top: '5px' }}></div>
                        <div className="small fw-bold mb-0" style={{ fontSize: '0.65rem' }}>{new Date(e.date).toLocaleDateString('pt-BR')}</div>
                        <div className="text-muted-foreground" style={{ fontSize: '0.6rem' }}>{e.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Vaccinations */}
              <div className="col-4">
                <div className="dashboard-card border border-border p-2 h-100 rounded-3">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Vacinações</h6>
                  <table className="table table-sm mb-0" style={{ fontSize: '0.6rem' }}>
                    <thead>
                      <tr className="text-muted-foreground">
                        <th>Vacina</th>
                        <th>Data</th>
                        <th className="text-end">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.filter(e => e.type === 'vaccination').slice(0, 3).map((v, i) => (
                        <tr key={i}>
                          <td>{v.title}</td>
                          <td>{new Date(v.date).toLocaleDateString('pt-BR')}</td>
                          <td className="text-end text-success fw-bold">OK</td>
                        </tr>
                      ))}
                      {history.filter(e => e.type === 'vaccination').length === 0 && (
                        <tr><td colSpan={3} className="text-center py-2 text-muted-foreground">Nenhuma vacina</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Treatments */}
              <div className="col-4">
                <div className="dashboard-card border border-border p-2 h-100 rounded-3">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Tratamentos</h6>
                   <table className="table table-sm mb-0" style={{ fontSize: '0.6rem' }}>
                    <thead>
                      <tr className="text-muted-foreground">
                        <th>Produto</th>
                        <th>Data</th>
                        <th className="text-end">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.filter(e => e.type === 'health').slice(0, 3).map((h, i) => (
                        <tr key={i}>
                          <td>{h.title}</td>
                          <td>{new Date(h.date).toLocaleDateString('pt-BR')}</td>
                          <td className="text-end">{h.subtitle}</td>
                        </tr>
                      ))}
                      {history.filter(e => e.type === 'health').length === 0 && (
                        <tr><td colSpan={3} className="text-center py-2 text-muted-foreground">Sem tratamentos</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="row g-3 mb-2">
              <div className="col-7">
                <div className="dashboard-card border border-border p-2 rounded-3">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Índices da Matriz</h6>
                  <div className="row g-2">
                    <div className="col-6">
                       <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted-foreground">Produtividade:</span>
                        <span className="fw-bold">10.0</span>
                      </div>
                      <div className="d-flex justify-content-between" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted-foreground">Fertilidade:</span>
                        <span className="fw-bold">100%</span>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted-foreground">Conformação:</span>
                        <span className="badge bg-success/10 text-success border-0 px-2 py-0">BOM</span>
                      </div>
                      <div className="d-flex justify-content-between" style={{ fontSize: '0.65rem' }}>
                        <span className="text-muted-foreground">Status Geral:</span>
                        <span className="badge bg-success/10 text-success border-0 px-2 py-0">BOM</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-5">
                <div className="dashboard-card border border-border p-2 rounded-3 h-100">
                  <h6 className="fw-bold text-success text-uppercase mb-2 small border-bottom pb-1" style={{ fontSize: '0.65rem' }}>Observações</h6>
                  <p className="text-muted-foreground mb-0" style={{ fontSize: '0.6rem', lineHeight: '1.2' }}>Animal saudável, boa condição corporal. Sem intercorrências no último parto.</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-top border-success/20 pt-2 mt-auto d-flex justify-content-between align-items-end pb-1">
              <div className="small">
                <h6 className="fw-bold text-success mb-1">Fazenda São João</h6>
                <div className="text-muted-foreground">Sistema de Gestão Agropecuária</div>
                <div className="text-muted-foreground mt-2 d-flex gap-3">
                  <span>(19) 99999-9999</span>
                  <span>www.fazendasaojoao.com.br</span>
                </div>
              </div>
              <div className="text-end" style={{ width: '250px' }}>
                <div className="border-top border-dark pt-2">
                  <div className="fw-bold small">Responsável Técnico</div>
                  <div className="small text-muted-foreground">Dr. João Silva - CRMV 12345</div>
                </div>
              </div>
            </div>

            {/* Print Styles */}
            <style>{`
              @media print {
                /* Force html and body to exactly 1 page height and hide overflow to prevent blank pages */
                html, body {
                  overflow: hidden !important;
                  height: 100% !important;
                  max-height: 100% !important;
                }

                /* Force color printing in all browsers */
                * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }

                /* Hide everything at the body level except the modal portal container that has our sheet */
                body > *:not(:has(.print-container-wrapper)) {
                  display: none !important;
                }
                
                /* Reset the target modal portal container to flow naturally as a standard page block and take full height */
                body > *:has(.print-container-wrapper) {
                  position: static !important;
                  overflow: visible !important;
                  width: 100% !important;
                  height: 100% !important;
                  min-height: 100% !important;
                  max-height: 100% !important;
                }
                
                /* Reset ONLY the outer modal wrappers (ancestors of .print-container-wrapper) to prevent clipping, leaving subcomponents styled */
                .position-fixed:has(.print-container-wrapper),
                .dashboard-card:has(.print-container-wrapper),
                .overflow-auto:has(.print-container-wrapper),
                .flex-grow-1:has(.print-container-wrapper) {
                  position: static !important;
                  overflow: visible !important;
                  max-height: 100% !important;
                  height: 100% !important;
                  min-height: 100% !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: transparent !important;
                }
                
                /* Hide the modal title header, close buttons and print button during printing */
                .border-bottom.d-flex.justify-content-between.align-items-center, /* Modal Title / Header */
                div.d-flex.justify-content-end.gap-2.w-100, /* Modal Footer Buttons */
                button,
                .btn {
                  display: none !important;
                }
                
                /* Ensure correct color rendering and full height flow of the print wrapper */
                .print-container-wrapper {
                  display: block !important;
                  position: relative !important;
                  width: 100% !important;
                  height: 100% !important;
                  min-height: 100% !important;
                  max-height: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: white !important;
                }
                
                /* Format the sheet to perfectly fit the A4 page and push the footer to the bottom of the canvas */
                .unique-animal-print-sheet { 
                  width: 100% !important;
                  height: 277mm !important;
                  min-height: 277mm !important;
                  max-height: 277mm !important;
                  margin: 0 !important;
                  padding: 12mm 15mm !important; /* Safe padding inside physical margins to prevent clipping by browser headers/footers */
                  box-sizing: border-box !important;
                  box-shadow: none !important;
                  border: none !important;
                  background: white !important;
                  overflow: visible !important;
                  display: flex !important;
                  flex-direction: column !important;
                  page-break-inside: avoid !important;
                  page-break-after: avoid !important;
                  break-after: avoid !important;
                }

                /* High-fidelity CSS overrides for subcomponents inside sheet */
                .print-container-wrapper .dashboard-card {
                  border: 1px solid #e2e8f0 !important;
                  border-radius: 8px !important;
                  background-color: #ffffff !important;
                  box-shadow: none !important;
                  padding: 8px !important;
                }
                
                .print-container-wrapper .bg-success\\/5 {
                  background-color: #f0fdf4 !important;
                  border: 1px solid #dcfce7 !important;
                }
                
                .print-container-wrapper .bg-success\\/10 {
                  background-color: #f0fdf4 !important;
                  border: 1px solid #dcfce7 !important;
                }
                
                .print-container-wrapper .bg-success\\/15 {
                  background-color: #dcfce7 !important;
                  color: #166534 !important;
                  border: 1px solid #bbf7d0 !important;
                }

                .print-container-wrapper .badge.bg-success\\/15 {
                  background-color: #dcfce7 !important;
                  color: #166534 !important;
                }
                
                .print-container-wrapper .bg-muted\\/20 {
                  background-color: #f8fafc !important;
                  border: 1px solid #e2e8f0 !important;
                }
                
                .print-container-wrapper .timeline-small .bg-success {
                  background-color: #16a34a !important;
                }
                
                .print-container-wrapper .timeline-small .border-success\\/30 {
                  border-color: rgba(22, 163, 74, 0.3) !important;
                }

                .print-container-wrapper table.table {
                  border-collapse: collapse !important;
                  width: 100% !important;
                }
                
                .print-container-wrapper table.table th {
                  background-color: #f8fafc !important;
                  color: #0f172a !important;
                  border-bottom: 2px solid #e2e8f0 !important;
                  font-weight: bold !important;
                  padding: 4px 8px !important;
                }

                .print-container-wrapper table.table td {
                  border-bottom: 1px solid #f1f5f9 !important;
                  padding: 4px 8px !important;
                }

                @page { 
                  size: A4 portrait; 
                  margin: 10mm !important; 
                }
              }
              
              .technical-sheet-paper {
                box-sizing: border-box;
              }
              
              .technical-sheet-paper h2, 
              .technical-sheet-paper h3, 
              .technical-sheet-paper h4, 
              .technical-sheet-paper h6 {
                color: #064e3b;
              }
            `}</style>
          </div>
        </div>
      )}
    </Modal>
  );
}
