"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Paperclip, Plus, Printer, Trash2 } from "lucide-react";
import {
  veterinaryService, vetError, type VetAnimal, type VetAttachment, type VetPrescription, type VetPrescriptionItem,
} from "@/services/veterinaryService";
import styles from "./veterinary.module.css";
import type { VetContext } from "./VeterinaryArea";

const EMPTY_ITEM: VetPrescriptionItem = { product: "", dose: "", route: "", frequency: "", duration: "" };
const MAX_BYTES = 10 * 1024 * 1024;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Attachments (ultrasound photos, PDFs) and prescriptions of one animal. */
export function AnimalRecords({ ctx, animal }: { ctx: VetContext; animal: VetAnimal }) {
  const { t, fmt, today, workspace } = ctx;
  const [files, setFiles] = useState<VetAttachment[] | null>(null);
  const [prescriptions, setPrescriptions] = useState<VetPrescription[] | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<VetPrescriptionItem[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState("");
  const [withdrawal, setWithdrawal] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([veterinaryService.attachments(animal.id), veterinaryService.prescriptions({ animal: animal.id })]);
    setFiles(a);
    setPrescriptions(p);
  }, [animal.id]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([veterinaryService.attachments(animal.id, controller.signal), veterinaryService.prescriptions({ animal: animal.id }, controller.signal)])
      .then(([a, p]) => { setFiles(a); setPrescriptions(p); })
      .catch(() => { if (!controller.signal.aborted) { setFiles([]); setPrescriptions([]); } });
    return () => controller.abort();
  }, [animal.id]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setMessage(t("vet.records.tooBig"));
    setBusy(true);
    try {
      await veterinaryService.uploadAttachment(animal.id, file, animal.last?.id);
      await load();
      setMessage(t("vet.records.uploaded"));
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const open = async (file: VetAttachment) => {
    try {
      const blob = await veterinaryService.attachmentBlob(file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setMessage(vetError(err, t("vet.error")));
    }
  };

  const remove = async (id: string, kind: "file" | "prescription") => {
    try {
      if (kind === "file") await veterinaryService.deleteAttachment(id);
      else await veterinaryService.deletePrescription(id);
      await load();
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    }
  };

  const savePrescription = async () => {
    const rows = items.filter(item => item.product.trim());
    if (!rows.length) return setMessage(t("vet.records.productRequired"));
    setBusy(true);
    try {
      await veterinaryService.createPrescription({ client: animal.client, animal: animal.id, date: today, items: rows, notes, withdrawal });
      setItems([{ ...EMPTY_ITEM }]); setNotes(""); setWithdrawal(""); setEditing(false);
      await load();
      setMessage(t("vet.records.prescriptionSaved"));
    } catch (err) {
      setMessage(vetError(err, t("vet.saveError")));
    } finally {
      setBusy(false);
    }
  };

  const print = (p: VetPrescription) => {
    const s = workspace.settings;
    const vet = [s.vet_name || s.last_responsible, s.vet_registry ? `CRMV ${s.vet_registry}` : "", s.vet_phone].filter(Boolean).join(" · ");
    const rows = p.items.map((item, i) => `<li><b>${i + 1}. ${escapeHtml(item.product)}</b>${[item.dose, item.route, item.frequency, item.duration].filter(Boolean).length ? `<br>${escapeHtml([item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(" · "))}` : ""}</li>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t("vet.records.prescription"))}</title>
      <style>body{font-family:system-ui,sans-serif;margin:40px;color:#14281d}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;font-size:13px}
      ol{list-style:none;padding:0;margin:20px 0}li{margin:0 0 12px;font-size:14px}.box{border-top:1px solid #ccc;margin-top:28px;padding-top:12px}
      .sign{margin-top:60px;border-top:1px solid #333;width:280px;padding-top:6px;font-size:12px}</style></head><body>
      <h1>${escapeHtml(t("vet.records.prescription"))}</h1>
      <p>${escapeHtml(vet)}</p>
      <p>${escapeHtml(t("vet.records.printClient", { client: p.client_name, animal: p.animal_identifier || "—", date: fmt.fd(p.date) }))}</p>
      <ol>${rows}</ol>
      ${p.withdrawal ? `<p><b>${escapeHtml(t("vet.records.withdrawal"))}:</b> ${escapeHtml(p.withdrawal)}</p>` : ""}
      ${p.notes ? `<div class="box"><p>${escapeHtml(p.notes)}</p></div>` : ""}
      <div class="sign">${escapeHtml(vet || t("vet.records.signature"))}</div>
      <script>window.onload=function(){window.print()}</script></body></html>`;
    const popup = window.open("", "_blank");
    if (!popup) return setMessage(t("vet.records.popupBlocked"));
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  };

  const setItem = (index: number, patch: Partial<VetPrescriptionItem>) => setItems(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className={styles.records}>
      <div>
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <span className={styles.label}><Paperclip size={14} aria-hidden="true" /> {t("vet.records.files")}</span>
          <label className={`btn btn-sm btn-outline-secondary mb-0 ${busy ? "disabled" : ""}`}>
            <Plus size={14} aria-hidden="true" /> {t("vet.records.addFile")}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" hidden disabled={busy} onChange={e => void upload(e.target.files?.[0])} />
          </label>
        </div>
        {files === null ? <p className={styles.muted}>{t("vet.loading")}</p> : files.length ? (
          <ul className={styles.fileList}>
            {files.map(file => (
              <li key={file.id}>
                <button type="button" className="btn btn-link btn-sm p-0 text-start" onClick={() => void open(file)}>{file.name}</button>
                <span className={styles.muted}>{fmt.fd(file.created_at.slice(0, 10))} · {Math.max(1, Math.round(file.size / 1024))} KB</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`${t("vet.records.remove")} ${file.name}`} onClick={() => void remove(file.id, "file")}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        ) : <p className={styles.hint} style={{ margin: "4px 0 0" }}>{t("vet.records.noFiles")}</p>}
      </div>

      <div>
        <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
          <span className={styles.label}><FileText size={14} aria-hidden="true" /> {t("vet.records.prescriptions")}</span>
          {!editing && <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(true)}><Plus size={14} aria-hidden="true" /> {t("vet.records.newPrescription")}</button>}
        </div>
        {editing && (
          <div className="d-grid gap-2 mt-2">
            {items.map((item, index) => (
              <div key={index} className={styles.grid}>
                <label className={styles.field}><span>{t("vet.records.product")}</span><input className="form-control" value={item.product} onChange={e => setItem(index, { product: e.target.value })} /></label>
                <label className={styles.field}><span>{t("vet.records.dose")}</span><input className="form-control" value={item.dose} onChange={e => setItem(index, { dose: e.target.value })} /></label>
                <label className={styles.field}><span>{t("vet.records.route")}</span><input className="form-control" value={item.route} onChange={e => setItem(index, { route: e.target.value })} /></label>
                <label className={styles.field}><span>{t("vet.records.frequency")}</span><input className="form-control" value={item.frequency} onChange={e => setItem(index, { frequency: e.target.value })} /></label>
                <label className={styles.field}><span>{t("vet.records.duration")}</span><input className="form-control" value={item.duration} onChange={e => setItem(index, { duration: e.target.value })} /></label>
              </div>
            ))}
            <button type="button" className="btn btn-sm btn-outline-secondary justify-self-start" style={{ justifySelf: "start" }} onClick={() => setItems(rows => [...rows, { ...EMPTY_ITEM }])}><Plus size={14} aria-hidden="true" /> {t("vet.records.addProduct")}</button>
            <label className={styles.field}><span>{t("vet.records.withdrawal")}</span><input className="form-control" value={withdrawal} onChange={e => setWithdrawal(e.target.value)} /></label>
            <label className={styles.field}><span>{t("vet.records.notes")}</span><textarea className="form-control" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
            <div className={styles.actions}>
              <button type="button" className="btn btn-sm btn-agro" disabled={busy} onClick={() => void savePrescription()}>{t("vet.records.savePrescription")}</button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(false)}>{t("vet.close")}</button>
            </div>
          </div>
        )}
        {prescriptions === null ? null : prescriptions.length ? (
          <ul className={styles.fileList}>
            {prescriptions.map(p => (
              <li key={p.id}>
                <span><b style={{ fontWeight: 600 }}>{fmt.fd(p.date)}</b> · {p.items.map(item => item.product).join(", ")}</span>
                <span className={styles.actions}>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => print(p)}><Printer size={13} aria-hidden="true" /> {t("vet.records.print")}</button>
                  <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={t("vet.records.remove")} onClick={() => void remove(p.id, "prescription")}><Trash2 size={13} /></button>
                </span>
              </li>
            ))}
          </ul>
        ) : !editing && <p className={styles.hint} style={{ margin: "4px 0 0" }}>{t("vet.records.noPrescriptions")}</p>}
      </div>
      {message && <p role="status" className={styles.hint} style={{ margin: 0 }}>{message}</p>}
    </div>
  );
}
