"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import styles from "./PWAInstallPrompt.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      let disposed = false;
      const isAppWorker = (scriptURL?: string) => {
        if (!scriptURL) return false;
        const url = new URL(scriptURL, window.location.origin);
        return url.origin === window.location.origin && url.pathname === "/sw.js";
      };
      const clearDevelopmentCache = async () => {
        if (!("serviceWorker" in navigator)) return;
        const controlled = isAppWorker(navigator.serviceWorker.controller?.scriptURL);
        const registrations = await navigator.serviceWorker.getRegistrations();
        const removed = await Promise.all(registrations.filter(registration =>
          [registration.active, registration.waiting, registration.installing].some(worker => isAppWorker(worker?.scriptURL))
        ).map(registration => registration.unregister()));
        if ("caches" in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.filter(key => key.startsWith("fazenda-mais-static-")).map(key => window.caches.delete(key)));
        }
        // Development chunks reuse URLs. An old PWA worker can otherwise restore
        // obsolete React code after each refresh, despite successful hot updates.
        if (!disposed && (controlled || removed.some(Boolean))) window.location.reload();
      };
      void clearDevelopmentCache().catch(() => {
        // Cache access can be blocked; development must still work online.
      });
      return () => { disposed = true; };
    }

    let removeServiceWorkerListener: (() => void) | undefined;
    if ("serviceWorker" in navigator) {
      let reloadingForUpdate = false;
      const reloadForUpdate = () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", reloadForUpdate);
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => {
        void registration.update();
      }).catch(() => {
        // A aplicação continua funcionando normalmente se o navegador bloquear o PWA.
      });
      removeServiceWorkerListener = () => navigator.serviceWorker.removeEventListener("controllerchange", reloadForUpdate);
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as NavigatorWithStandalone).standalone);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    const iosHelpFrame = window.requestAnimationFrame(() => {
      if (isIos && !standalone) setShowIosHelp(true);
    });

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      removeServiceWorkerListener?.();
      window.cancelAnimationFrame(iosHelpFrame);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  if (dismissed || (!installPrompt && !showIosHelp)) return null;

  return (
    <aside className={styles.prompt} aria-label="Instalar Fazenda Mais" aria-live="polite">
      <button
        type="button"
        className={styles.close}
        onClick={() => setDismissed(true)}
        aria-label="Fechar opção de instalação"
      >
        <X size={17} aria-hidden="true" />
      </button>

      <div className={styles.icon} aria-hidden="true">
        {installPrompt ? <Download size={23} /> : <Share2 size={22} />}
      </div>
      <div className={styles.content}>
        <strong>Instale o Fazenda Mais</strong>
        {installPrompt ? (
          <>
            <span>Acesse rapidamente pela tela inicial do seu dispositivo.</span>
            <button type="button" className={styles.install} onClick={install}>
              Instalar aplicativo
            </button>
          </>
        ) : (
          <span>
            No Safari, toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.
          </span>
        )}
      </div>
    </aside>
  );
}
