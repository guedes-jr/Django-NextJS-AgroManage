"use client";

import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="position-fixed d-flex flex-column gap-2"
        style={{ top: "80px", right: "20px", zIndex: 9999 }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle size={20} className="text-success" />,
    error: <AlertCircle size={20} className="text-danger" />,
    info: <Info size={20} className="text-primary" />,
    warning: <AlertTriangle size={20} className="text-warning" />,
  };

  const bgColors = {
    success: "bg-success/10 border-success",
    error: "bg-danger/10 border-danger",
    info: "bg-primary/10 border-primary",
    warning: "bg-warning/10 border-warning",
  };

  return (
    <div
      className={`d-flex align-items-center gap-2 p-3 rounded-3 border shadow-sm ${bgColors[toast.type]}`}
      style={{ minWidth: "280px", maxWidth: "360px", animation: "slideIn 0.3s ease-out" }}
    >
      {icons[toast.type]}
      <p className="small mb-0 flex-grow-1">{toast.message}</p>
      <button onClick={onClose} className="btn btn-link p-0 text-muted">
        <X size={16} />
      </button>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}