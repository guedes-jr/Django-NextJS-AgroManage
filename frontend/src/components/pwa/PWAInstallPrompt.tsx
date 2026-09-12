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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        // A aplicação continua funcionando normalmente se o navegador bloquear o PWA.
      });
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
