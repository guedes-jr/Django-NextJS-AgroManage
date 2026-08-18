"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, FileText, MapPin, Pencil, Plus, Ruler, Trash2 } from "lucide-react";

import { apiClient } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import type { Farm } from "@/types";

import styles from "@/components/farm/StructureDedicatedPage.module.css";
import axios from "axios";

interface PaginatedFarms { results: Farm[] }

const emptyForm = { name: "", code: "", total_area_ha: "", city: "", state: "", address: "", notes: "" };

const apiMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error) || !error.response?.data) return fallback;
  const first = Object.entries(error.response.data as Record<string, unknown>)[0];
  if (!first) return fallback;
  const detail = Array.isArray(first[1]) ? first[1][0] : first[1];
  return `${first[0] === "detail" ? "" : `${first[0]}: `}${String(detail)}`;
};

export default function PropriedadePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [farms, setFarms] = useState<Farm[]>([]);
  
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Farm | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [role] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return (JSON.parse(localStorage.getItem("user") || "{}") as { role?: string }).role || ""; } catch { return ""; }
  });
  const canDelete = role === "owner" || role === "admin";

  const loadFarms = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<PaginatedFarms>("/farms/", { params: { page_size: 100 } });
      setFarms(data.results || []);
    } catch {
      setError("Não foi possível carregar as propriedades.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFarms();
  }, []);

  const resetForm = () => { 
    setEditing(null); 
    setForm(emptyForm); 
  };

  const editFarm = (farm: Farm) => {
    setEditing(farm);
    setForm({
      name: farm.name || "",
      code: farm.code || "",
      total_area_ha: farm.total_area_ha ? String(farm.total_area_ha) : "",
      city: farm.city || "",
      state: farm.state || "",
      address: farm.address || "",
      notes: farm.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveFarm = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setError("Informe o nome da propriedade.");
    
    setSaving(true);
    setError("");
    
    const payload = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      total_area_ha: form.total_area_ha ? Number(form.total_area_ha) : null
    };

    try {
      if (editing) {
        await apiClient.put(`/farms/${editing.id}/`, payload);
        showToast("Propriedade atualizada com sucesso.", "success");
      } else {
        await apiClient.post("/farms/", payload);
        showToast("Propriedade cadastrada com sucesso.", "success");
      }
      resetForm();
      await loadFarms();
    } catch (err) { 
      const msg = apiMessage(err, "Não foi possível salvar os dados da propriedade.");
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const removeFarm = async (farm: Farm) => {
    if (!confirm(`Excluir a propriedade: ${farm.name}? Esta ação é irreversível.`)) return;
    try {
      await apiClient.delete(`/farms/${farm.id}/`);
      if (editing?.id === farm.id) resetForm();
      await loadFarms();
      showToast("Propriedade excluída com sucesso.", "success");
    } catch {
      setError("Não foi possível excluir a propriedade.");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className="d-flex gap-3 align-items-center">
          <button className="btn btn-link text-white p-0" onClick={() => router.push("/home/estrutura")}><ArrowLeft size={28} /></button>
          <Building2 size={38} />
          <div><h1>Propriedades</h1><p>Cadastre e gerencie as fazendas da sua organização</p></div>
        </div>
        <button className="btn btn-light fw-semibold" onClick={resetForm}><Plus size={17} /> Nova propriedade</button>
      </header>
      
      <main className={styles.content}>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        
        <section className={styles.panel}>
          <h2>1. Dados da Propriedade</h2>
          <form onSubmit={saveFarm}>
            <div className="row g-3">
              <div className="col-md-8">
                <label className="form-label fw-bold">Nome da propriedade *</label>
                <div className="login-input-wrapper">
                  <input required className="form-control ps-5" placeholder="Ex.: Fazenda Boa Esperança" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Building2 className="position-absolute ms-3 mt-2 text-muted" size={18} style={{ zIndex: 10 }} />
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold">Código / CAR</label>
                <div className="login-input-wrapper">
                  <input className="form-control ps-5" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  <FileText className="position-absolute ms-3 mt-2 text-muted" size={18} style={{ zIndex: 10 }} />
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label fw-bold">Área total (ha)</label>
                <div className="login-input-wrapper">
                  <input type="number" min="0" step="0.01" className="form-control ps-5" value={form.total_area_ha} onChange={(e) => setForm({ ...form, total_area_ha: e.target.value })} />
                  <Ruler className="position-absolute ms-3 mt-2 text-muted" size={18} style={{ zIndex: 10 }} />
                </div>
              </div>
              <div className="col-md-5">
                <label className="form-label fw-bold">Cidade</label>
                <input className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label fw-bold">UF</label>
                <input className="form-control text-uppercase" maxLength={2} placeholder="PE" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div className="col-12">
                <label className="form-label fw-bold">Endereço</label>
                <div className="login-input-wrapper">
                  <input className="form-control ps-5" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                  <MapPin className="position-absolute ms-3 mt-2 text-muted" size={18} style={{ zIndex: 10 }} />
                </div>
              </div>
              <div className="col-12">
                <label className="form-label fw-bold">Observações</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Limpar</button>
              <button className="btn btn-success px-4" disabled={saving}>{saving ? "Salvando..." : (editing ? "Atualizar" : "Salvar")}</button>
            </div>
          </form>
        </section>

        <section className={styles.panel}>
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <h2 className="mb-1">2. Fazendas Cadastradas</h2>
              <p className="text-muted small mb-0">Relação consolidada de todas as propriedades da organização.</p>
            </div>
          </div>
          <div className="table-responsive mt-3">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Nome da Propriedade</th>
                  <th>CAR / Código</th>
                  <th>Área (ha)</th>
                  <th>Cidade/UF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-5"><span className="spinner-border spinner-border-sm text-success" /></td></tr>
                ) : farms.length ? (
                  farms.map((farm) => (
                    <tr key={farm.id}>
                      <td><strong>{farm.name}</strong></td>
                      <td>{farm.code || "—"}</td>
                      <td>{farm.total_area_ha || "—"}</td>
                      <td>{farm.city ? `${farm.city}${farm.state ? ` - ${farm.state}` : ''}` : "—"}</td>
                      <td className="text-end">
                        <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => editFarm(farm)} title="Editar"><Pencil size={15} /></button>
                        {canDelete && <button className="btn btn-sm btn-outline-danger" onClick={() => void removeFarm(farm)} title="Excluir"><Trash2 size={15} /></button>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="text-center text-muted py-5">Nenhuma propriedade cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
