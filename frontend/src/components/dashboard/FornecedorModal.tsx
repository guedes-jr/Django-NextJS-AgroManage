"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Phone, Mail, FileText, MapPin, Check, Save, Building2, 
  Camera, Upload, XCircle
} from "lucide-react";
import { apiClient, getMediaUrl, uploadFile } from "@/services/api";
import { useToast } from "@/components/ui/Toast";

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return `(${digits.slice(0, 2)}`;
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}-${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

interface FornecedorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  fornecedorInitial?: any;
}

export type TipoContrato = "spot" | "mensal" | "anual";

const tipoContratoOptions = [
  { id: "spot", label: "Eventual", desc: "Compras pontuais" },
  { id: "mensal", label: "Mensal", desc: "Recorrente mensal" },
  { id: "anual", label: "Anual", desc: "Contrato longo prazo" },
];

export function FornecedorModal({ isOpen, onClose, onSave, fornecedorInitial }: FornecedorModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    nome: "",
    telefone: "",
    telefone_2: "",
    telefone_3: "",
    email: "",
    cnpj: "",
    cidade: "",
    estado: "",
    tipo_contrato: "spot" as TipoContrato,
    ativo: true,
  });

  useEffect(() => {
    if (fornecedorInitial) {
      setFormData({
        nome: fornecedorInitial.nome || "",
        telefone: fornecedorInitial.telefone || "",
        telefone_2: fornecedorInitial.telefone_2 || "",
        telefone_3: fornecedorInitial.telefone_3 || "",
        email: fornecedorInitial.email || "",
        cnpj: fornecedorInitial.cnpj || "",
        cidade: fornecedorInitial.cidade || "",
        estado: fornecedorInitial.estado || "",
        tipo_contrato: fornecedorInitial.tipo_contrato || "spot",
        ativo: fornecedorInitial.ativo ?? true,
      });
      if (fornecedorInitial.imagem) {
        setImagePreview(getMediaUrl(fornecedorInitial.imagem));
      } else {
        setImagePreview(null);
      }
    } else {
      setFormData({
        nome: "",
        telefone: "",
        telefone_2: "",
        telefone_3: "",
        email: "",
        cnpj: "",
        cidade: "",
        estado: "",
        tipo_contrato: "spot",
        ativo: true,
      });
      setImagePreview(null);
    }
    setImageFile(null);
  }, [fornecedorInitial, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome.trim()) {
      showToast("Nome é obrigatório", "warning", 15000);
      return;
    }
    
    setLoading(true);
    try {
      // Create FormData for proper multipart/form-data encoding
      const submitData = new FormData();
      submitData.append("nome", formData.nome.trim());
      submitData.append("telefone", formData.telefone || "");
      submitData.append("telefone_2", formData.telefone_2 || "");
      submitData.append("telefone_3", formData.telefone_3 || "");
      submitData.append("email", formData.email || "");
      submitData.append("cnpj", formData.cnpj || "");
      submitData.append("cidade", formData.cidade || "");
      submitData.append("estado", formData.estado || "");
      submitData.append("tipo_contrato", formData.tipo_contrato);
      submitData.append("ativo", String(formData.ativo));
      
      let savedData: any;
      
      const FORNECEDOR_API = "/inventory/fornecedores/";
      
      try {
        if (fornecedorInitial?.id) {
          const { data } = await apiClient.put(`${FORNECEDOR_API}${fornecedorInitial.id}`, submitData);
          savedData = data;
        } else {
          const { data } = await apiClient.post(FORNECEDOR_API, submitData);
          savedData = data;
        }
      } catch (apiErr: any) {
        const status = apiErr.response?.status;
        const data = apiErr.response?.data;
        let errorMessage = "Erro ao salvar fornecedor.";
        
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          const messages = Object.entries(data)
            .map(([key, value]) => {
              const val = Array.isArray(value) ? value.join(", ") : String(value);
              return `${key}: ${val}`;
            })
            .filter(msg => msg.trim());
          
          if (messages.length > 0) {
            errorMessage = "Erro ao salvar:\n" + messages.join("\n");
          }
        } else if (data?.detail) {
          errorMessage = `Erro: ${data.detail}`;
        } else if (status) {
          errorMessage = `Erro ${status}: ${apiErr.message || "Falha ao salvar"}`;
        }
        
        showToast(errorMessage, "error", 15000);
        throw apiErr;
      }

      if (imageFile && savedData?.id) {
        try {
          await uploadFile(
            `${FORNECEDOR_API}${savedData.id}/upload_imagem/`,
            imageFile,
            "imagem"
          );
        } catch (uploadErr) {
          // Continue - supplier was created, image is optional
        }
      }

      onSave();
      onClose();
    } catch (err: any) {
      // Error already shown via alert above
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast("Imagem deve ter menos de 5MB", "warning", 15000);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageFile(file);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFile(null);
  };

  

  if (!isOpen) return null;

  const inputStyle = {
    height: '48px',
    padding: '0 1rem 0 2.75rem',
    border: '1.5px solid var(--border)',
    borderRadius: '12px',
  } as const;

  const inputLabelStyle = {
    height: '48px',
    padding: '0 1rem',
    border: '1.5px solid var(--border)',
    borderRadius: '12px',
  } as const;

  return (
    <AnimatePresence>
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
        />
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2 p-md-4" style={{ zIndex: 1050 }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-100 h-100 d-flex align-items-center justify-content-center"
            style={{ maxWidth: '48rem' }}
          >
            <div className="dashboard-card shadow-lg border border-border w-100 transparent-scrollbar" style={{ maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}>
              <form onSubmit={handleSubmit} className="p-0" style={{ backgroundColor: "var(--background)" }}>
                <div className="p-4 border-bottom border-border d-flex justify-content-between align-items-center" style={{ background: "var(--muted)" }}>
                  <div>
                    <h2 className="fw-bold mb-1" style={{ fontSize: "1.25rem", color: "var(--foreground)" }}>
                      {fornecedorInitial ? "Editar Fornecedor" : "Novo Fornecedor"}
                    </h2>
                    <p className="text-muted-foreground small mb-0">
                      {fornecedorInitial ? "Atualize os dados do parceiro" : "Cadastre um novo parceiro comercial"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-light p-2 border-0 rounded-circle"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-4">
                  {/* Photo Upload */}
                  <div className="d-flex flex-column align-items-center mb-4">
                    <div className="position-relative mb-2" style={{ width: '80px', height: '80px' }}>
                      <input
                        type="file"
                        id="fornecedor-image-upload"
                        accept="image/jpeg,image/png,image/webp"
                        className="d-none"
                        onChange={handleImageChange}
                      />
                      <label 
                        htmlFor="fornecedor-image-upload" 
                        className="d-block w-100 h-100 rounded-circle overflow-hidden"
                        style={{ cursor: 'pointer' }}
                      >
                        {imagePreview ? (
                          <img
                            src={imagePreview}
                            alt={formData.nome || "Fornecedor"}
                            className="w-100 h-100 object-fit-cover"
                          />
                        ) : (
                          <div className="w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-muted rounded-circle">
                            <Upload className="text-muted-foreground" size={24} />
                          </div>
                        )}
                      </label>
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={removeImage}
                          className="position-absolute top-0 end-0 bg-danger text-white rounded-circle d-flex align-items-center justify-content-center"
                          style={{ width: '24px', height: '24px' }}
                        >
                          <XCircle size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Logo do fornecedor</p>
                  </div>

                  {/* Dados Principais */}
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Dados Principais</h3>
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">
                          Razão Social / Nome
                          <span className="text-danger ms-1">*</span>
                        </label>
                        <div className="position-relative">
                          <Building2 size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            required
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="Ex: AgroNutri Alimentos Ltda"
                            value={formData.nome}
                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="col-12">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">CNPJ</label>
                        <div className="position-relative">
                          <FileText size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="00.000.000/0001-00"
                            value={formData.cnpj}
                            onChange={(e) => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contato - 3 telefones */}
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Telefones</h3>
                    <div className="row g-3">
                      <div className="col-12 col-md-4">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">WhatsApp</label>
                        <div className="position-relative">
                          <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="(00) 00000-0000"
                            value={formData.telefone}
                            onChange={(e) => setFormData({ ...formData, telefone: formatPhone(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">Telefone 2</label>
                        <div className="position-relative">
                          <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="(00) 0000-0000"
                            value={formData.telefone_2}
                            onChange={(e) => setFormData({ ...formData, telefone_2: formatPhone(e.target.value) })}
                          />
                        </div>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">Telefone 3</label>
                        <div className="position-relative">
                          <Phone size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="(00) 0000-0000"
                            value={formData.telefone_3}
                            onChange={(e) => setFormData({ ...formData, telefone_3: formatPhone(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* E-mail e Localização */}
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>E-mail e Localização</h3>
                    <div className="row g-3">
                      <div className="col-12 col-md-8">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">E-mail</label>
                        <div className="position-relative">
                          <Mail size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="email"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="contato@empresa.com.br"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">Estado</label>
                        <input
                          type="text"
                          maxLength={2}
                          className="w-100"
                          style={{ ...inputLabelStyle, textAlign: 'center' }}
                          placeholder="UF"
                          value={formData.estado}
                          onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                        />
                      </div>
                      <div className="col-12">
                        <label className="small fw-bold text-muted-foreground mb-1 d-block">Cidade</label>
                        <div className="position-relative">
                          <MapPin size={18} className="position-absolute" style={{ left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                          <input
                            type="text"
                            className="w-100"
                            style={{ ...inputStyle }}
                            placeholder="Ex: Uberlândia"
                            value={formData.cidade}
                            onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modalidade */}
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Modalidade de Contrato</h3>
                    <div className="row g-2">
                      {tipoContratoOptions.map((tipo) => (
                        <div className="col-4" key={tipo.id}>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, tipo_contrato: tipo.id as TipoContrato })}
                            className={`w-100 p-3 rounded-xl border text-center transition-all ${
                              formData.tipo_contrato === tipo.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-muted-foreground'
                            }`}
                          >
                            <span className={`d-block fw-semibold ${formData.tipo_contrato === tipo.id ? 'text-primary' : ''}`}>
                              {tipo.label}
                            </span>
                            <span className="d-block text-xs text-muted-foreground">{tipo.desc}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ativo */}
                  <div className="d-flex align-items-center gap-3 p-3 bg-muted rounded-xl">
                    <input 
                      type="checkbox" 
                      id="fornecedor_ativo"
                      className="form-check-input"
                      style={{ width: '20px', height: '20px' }}
                      checked={formData.ativo}
                      onChange={(e) => setFormData({...formData, ativo: e.target.checked})}
                    />
                    <label htmlFor="fornecedor_ativo" className="form-check-label fw-semibold">
                      Fornecedor Ativo
                    </label>
                  </div>
                </div>

                <div className="p-3 p-md-4 border-top border-border d-flex justify-content-end gap-2" style={{ background: "var(--background)" }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-light px-4 py-2"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn px-4 py-2"
                    style={{ background: 'oklch(0.55 0.16 145)', color: 'white' }}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Save size={16} className="me-2" />
                        {fornecedorInitial ? "Atualizar" : "Salvar Fornecedor"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </>
    </AnimatePresence>
  );
}