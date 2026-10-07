"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

const spokenText = (text: string) => text
  .replace(/```[\s\S]*?```/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_`>#-]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export function useBrowserVoice() {
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const canDictate = typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const stopDictation = useCallback(() => recognition.current?.stop(), []);
  const dictate = useCallback((onTranscript: (text: string) => void) => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) { setError("A digitação por voz não é compatível com este navegador."); return; }
    setError("");
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = "pt-BR";
    instance.continuous = false;
    instance.interimResults = true;
    instance.onresult = event => onTranscript(Array.from(event.results).map(result => result[0]?.transcript || "").join("").trim());
    instance.onerror = event => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setError("Permita o uso do microfone para ditar sua mensagem.");
      else if (event.error !== "aborted") setError("Não foi possível reconhecer a fala. Tente novamente.");
    };
    instance.onend = () => { recognition.current = null; setListening(false); };
    setListening(true);
    instance.start();
  }, []);

  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);
  const speak = useCallback((text: string) => {
    if (!canSpeak) { setError("A leitura em voz alta não é compatível com este navegador."); return; }
    const content = spokenText(text);
    if (!content) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "pt-BR";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setError("Não foi possível reproduzir esta resposta."); };
    setError(""); setSpeaking(true); window.speechSynthesis.speak(utterance);
  }, [canSpeak]);

  useEffect(() => () => { recognition.current?.stop(); window.speechSynthesis?.cancel(); }, []);
  return { listening, speaking, error, canDictate, canSpeak, dictate, stopDictation, speak, stopSpeaking };
}
