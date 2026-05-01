"use client";

import { useEffect, useState, createContext, useContext, ReactNode, useCallback } from "react";
import { AlertCircle, CheckCircle, InfoIcon, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let toastId = 0;

const toastConfig = {
  success: {
    icon: CheckCircle,
    bgColor: "linear-gradient(135deg, rgba(16, 185, 129, 0.95) 0%, rgba(5, 150, 105, 0.95) 100%)",
    borderColor: "rgba(16, 185, 129, 0.5)",
    iconColor: "#ffffff",
    textColor: "#ffffff"
  },
  error: {
    icon: AlertCircle,
    bgColor: "linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(220, 38, 38, 0.95) 100%)",
    borderColor: "rgba(239, 68, 68, 0.5)",
    iconColor: "#ffffff",
    textColor: "#ffffff"
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "linear-gradient(135deg, rgba(245, 158, 11, 0.95) 0%, rgba(217, 119, 6, 0.95) 100%)",
    borderColor: "rgba(245, 158, 11, 0.5)",
    iconColor: "#ffffff",
    textColor: "#ffffff"
  },
  info: {
    icon: InfoIcon,
    bgColor: "linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%)",
    borderColor: "rgba(59, 130, 246, 0.5)",
    iconColor: "#ffffff",
    textColor: "#ffffff"
  }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 15000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          pointerEvents: "none"
        }}
      >
        {toasts.map((toast) => {
          const config = toastConfig[toast.type];
          const Icon = config.icon;

          return (
            <div
              key={toast.id}
              onClick={() => removeToast(toast.id)}
              style={{
                background: config.bgColor,
                border: `1.5px solid ${config.borderColor}`,
                borderRadius: "12px",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
                minWidth: "320px",
                maxWidth: "480px",
                cursor: "pointer",
                pointerEvents: "auto",
                animation: "slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                backdropFilter: "blur(10px)",
              }}
              role="alert"
            >
              <div style={{ flexShrink: 0, color: config.iconColor }}>
                <Icon size={20} strokeWidth={2} />
              </div>

              <div
                style={{
                  flex: 1,
                  fontSize: "14px",
                  fontWeight: "500",
                  lineHeight: 1.4,
                  color: config.textColor
                }}
              >
                {toast.message}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: config.textColor,
                  opacity: 0.7,
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.opacity = "0.7";
                }}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100px) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0) translateY(0);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}