import { X, MapPin, ThermometerSun, ThumbsUp, ThumbsDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BreedInfo } from "@/constants/breedInfo";

interface BreedInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  breed: BreedInfo;
}

export function BreedInfoModal({ isOpen, onClose, breed }: BreedInfoModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ 
              background: "rgba(0, 0, 0, 0.4)", 
              backdropFilter: "blur(4px)",
              zIndex: 1040 
            }}
            onClick={onClose}
          />
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2 p-md-4 pe-none" style={{ zIndex: 1050 }}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="dashboard-card border-0 shadow-lg rounded-4 overflow-hidden pe-auto w-100"
              style={{ backgroundColor: "var(--card)", maxWidth: "800px" }}
            >
            {/* Header with Gradient */}
            <div className="modal-header border-0 pb-0 position-relative">
              <div className="position-absolute top-0 start-0 w-100 h-100 bg-primary/10" style={{ zIndex: 0 }}></div>
              <div className="d-flex w-100 justify-content-between align-items-center position-relative" style={{ zIndex: 1, padding: '1.5rem 1.5rem 1rem' }}>
                <div>
                  <h4 className="modal-title fw-bold text-foreground mb-1">{breed.name}</h4>
                  <span className="badge bg-primary text-primary-foreground rounded-pill px-3 py-1 fw-medium shadow-sm">Ficha Zootécnica</span>
                </div>
                <button type="button" className="btn btn-light rounded-circle p-2 border-0 shadow-sm text-muted-foreground hover-text-foreground transition-colors" onClick={onClose}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="modal-body p-4 pt-4">
              <p className="text-foreground lead" style={{ fontSize: '1.1rem' }}>
                {breed.description}
              </p>

              <div className="row g-4 mt-2">
                <div className="col-md-6">
                  <div className="p-4 rounded-4 bg-white border border-border h-100 shadow-sm">
                    <div className="d-flex align-items-center gap-2 mb-3 text-primary">
                      <MapPin size={20} />
                      <h6 className="fw-bold mb-0">Origem</h6>
                    </div>
                    <p className="text-muted-foreground small mb-0">{breed.origin}</p>
                  </div>
                </div>
                
                <div className="col-md-6">
                  <div className="p-4 rounded-4 bg-white border border-border h-100 shadow-sm">
                    <div className="d-flex align-items-center gap-2 mb-3 text-warning">
                      <ThermometerSun size={20} />
                      <h6 className="fw-bold mb-0">Ambiente Ideal</h6>
                    </div>
                    <p className="text-muted-foreground small mb-0">{breed.environment}</p>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-4 rounded-4 bg-white border border-border h-100 shadow-sm">
                    <div className="d-flex align-items-center gap-2 mb-3 text-success">
                      <ThumbsUp size={20} />
                      <h6 className="fw-bold mb-0">Pontos Fortes</h6>
                    </div>
                    <ul className="text-muted-foreground small mb-0 ps-3">
                      {breed.strengths.map((s, idx) => (
                        <li key={idx} className="mb-2">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-4 rounded-4 bg-white border border-border h-100 shadow-sm">
                    <div className="d-flex align-items-center gap-2 mb-3 text-danger">
                      <ThumbsDown size={20} />
                      <h6 className="fw-bold mb-0">Pontos Fracos / Cuidados</h6>
                    </div>
                    <ul className="text-muted-foreground small mb-0 ps-3">
                      {breed.weaknesses.map((w, idx) => (
                        <li key={idx} className="mb-2">{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer border-top border-border bg-muted/20 p-3">
              <button type="button" className="btn btn-primary rounded-pill px-4" onClick={onClose}>
                Entendi
              </button>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
