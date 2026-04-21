"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, description, children, footer, maxWidth = "max-w-2xl" }: ModalProps) {
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; }
  }, [isOpen]);

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
          <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-4 pe-none" style={{ zIndex: 1050 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className={`w-100 ${maxWidth} pe-auto`}
            >
              <div className="dashboard-card overflow-hidden shadow-lg border border-border" style={{ maxHeight: "calc(100vh - 2rem)", display: "flex", flexDirection: "column" }}>
                
                {(title || description) && (
                  <div className="p-4 border-bottom border-border d-flex justify-content-between align-items-center" style={{ background: "var(--muted)" }}>
                    <div>
                      {title && <h2 className="fw-bold mb-1" style={{ fontSize: "1.25rem", color: "var(--foreground)" }}>{title}</h2>}
                      {description && <p className="text-muted-foreground small mb-0">{description}</p>}
                    </div>
                    <Button variant="outline-secondary" className="p-2 ms-4 border-0 hover-bg-border rounded-circle" onClick={onClose}>
                      <X size={20} />
                    </Button>
                  </div>
                )}
                
                <div className="p-0 overflow-auto flex-grow-1" style={{ backgroundColor: "var(--background)" }}>
                  {children}
                </div>
                
                {footer && (
                  <div className="p-4 border-top border-border d-flex justify-content-between align-items-center" style={{ background: "var(--background)" }}>
                    {footer}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
