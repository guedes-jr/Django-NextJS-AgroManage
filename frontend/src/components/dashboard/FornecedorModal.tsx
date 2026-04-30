"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Phone, Mail, FileText, MapPin, Check, Save, Building2, 
  Camera, Upload, XCircle
} from "lucide-react";
import { apiClient, getMediaUrl, uploadFile } from "@/services/api";
import { useToast } from "@/components/ui/Toast";
import { FormInput, FormSelect, FormError } from "@/components/ui/FormError";

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isFetchingCNPJ, setIsFetchingCNPJ] = useState(false);
  const [isFetchingCEP, setIsFetchingCEP] = useState(false);
  
  const [formData, setFormData] = useState({
    nome: "",
    cnpj: "",
    tipo_contrato: "spot" as TipoContrato,
    contatos: [] as { label: string; valor: string; tipo: string }[],
    enderecos: [] as { 
      cep: string; logradouro: string; numero: string; bairro: string; 
      complemento: string; cidade: string; estado: string; latitude: string; longitude: string 
    }[],
    logo_url: "",
    ativo: true,
  });

  useEffect(() => {
    if (fornecedorInitial) {
      setFormData({
        nome: fornecedorInitial.nome || "",
        cnpj: fornecedorInitial.cnpj || "",
        tipo_contrato: fornecedorInitial.tipo_contrato || "spot",
        contatos: fornecedorInitial.contatos || [],
        enderecos: (fornecedorInitial.enderecos || []).map((addr: any) => ({
          cep: addr.cep || "",
          logradouro: addr.logradouro || "",
          numero: addr.numero || "",
          bairro: addr.bairro || "",
          complemento: addr.complemento || "",
          cidade: addr.cidade || "",
          estado: addr.estado || "",
          latitude: addr.latitude || "",
          longitude: addr.longitude || "",
        })),
        logo_url: fornecedorInitial.logo_url || "",
        ativo: fornecedorInitial.ativo ?? true,
      });
      if (fornecedorInitial.imagem) {
        setImagePreview(getMediaUrl(fornecedorInitial.imagem));
      } else if (fornecedorInitial.logo_url) {
        setImagePreview(fornecedorInitial.logo_url);
      } else {
        setImagePreview(null);
      }
      setImageFile(null);
    } else {
      setFormData({
        nome: "",
        cnpj: "",
        tipo_contrato: "spot",
        contatos: [],
        enderecos: [],
        logo_url: "",
        ativo: true,
      });
      setImagePreview(null);
      setImageFile(null);
    }
  }, [fornecedorInitial, isOpen]);

  // Validation functions
  const validateNome = (value: string): string => {
    if (!value || !value.trim()) {
      return "Nome é obrigatório";
    }
    if (value.trim().length < 3) {
      return "Nome deve ter pelo menos 3 caracteres";
    }
    return "";
  };

  const validateEmail = (value: string): string => {
    if (!value) return ""; // Email é opcional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return "E-mail inválido. Use formato: nome@empresa.com";
    }
    return "";
  };

  const validateTipoContrato = (value: string): string => {
    if (!value) {
      return "Tipo de contrato é obrigatório";
    }
    const validChoices = ["spot", "mensal", "anual"];
    if (!validChoices.includes(value)) {
      return "Selecione um tipo de contrato válido";
    }
    return "";
  };

  const validateCNPJ = (value: string): string => {
    if (!value) return ""; // CNPJ é opcional
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14) {
      return "CNPJ deve ter 14 dígitos";
    }
    // Simple CNPJ validation (first digit check)
    if (digits === "00000000000000") {
      return "CNPJ inválido";
    }
    return "";
  };

  const validateEstado = (value: string): string => {
    if (!value) return ""; // Estado é opcional
    if (value.length > 2) {
      return "Estado deve ter no máximo 2 caracteres (ex: SP)";
    }
    return "";
  };

  const fetchCNPJData = async (cnpj: string) => {
    const cleanCNPJ = cnpj.replace(/\D/g, "");
    if (cleanCNPJ.length !== 14) return;

    setIsFetchingCNPJ(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCNPJ}`);
      if (response.ok) {
        const data = await response.json();
        
        const newContacts: any[] = [];
        if (data.ddd_telefone_1) newContacts.push({ label: "Principal", valor: formatPhone(data.ddd_telefone_1), tipo: "telefone" });
        if (data.ddd_telefone_2) newContacts.push({ label: "Secundário", valor: formatPhone(data.ddd_telefone_2), tipo: "telefone" });
        if (data.email) newContacts.push({ label: "E-mail Oficial", valor: data.email, tipo: "email" });

        const newAddress = {
          cep: formatCEP(data.cep || ""),
          logradouro: `${data.descricao_tipo_de_logradouro || ""} ${data.logradouro || ""}`.trim(),
          numero: data.numero || "",
          bairro: data.bairro || "",
          complemento: data.complemento || "",
          cidade: data.municipio || "",
          estado: data.uf || "",
          latitude: "",
          longitude: ""
        };

        const targetIdx = formData.enderecos.length;

        // Try to fetch logo
        let logo_url = "";
        const tryFetchLogo = async (query: string) => {
          try {
            const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`);
            const suggestions = await res.json();
            let domain = "";
            if (suggestions && suggestions.length > 0) {
              domain = suggestions[0].domain;
            } else {
              // Fallback domain guess for common Brazilian companies
              const lowerQuery = query.toLowerCase();
              if (lowerQuery.includes("petrobras")) domain = "petrobras.com.br";
              if (lowerQuery.includes("banco do brasil")) domain = "bb.com.br";
            }

            if (domain) {
              const url = `https://icons.duckduckgo.com/ip3/${domain}.ico`; // DuckDuckGo is often more reliable for icons
              setFormData(prev => ({ ...prev, logo_url: url }));
              if (!imagePreview && !imageFile) {
                setImagePreview(url);
              }
            }
          } catch (e) {
            console.error("Erro ao buscar logo via autocomplete:", e);
          }
        };

        if (data.email) {
          const domain = data.email.split('@')[1]?.toLowerCase();
          const generic = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'uol.com.br', 'bol.com.br', 'ig.com.br', 'terra.com.br'];
          if (domain && !generic.includes(domain)) {
            logo_url = `https://logo.clearbit.com/${domain}`;
            if (!imagePreview && !imageFile) {
              setImagePreview(logo_url);
            }
          } else {
            // If email is generic, try searching by name
            const searchName = data.nome_fantasia || data.razao_social || "";
            tryFetchLogo(searchName.split(' ')[0]); // Use first word for better search
          }
        } else {
          // No email, search by name
          const searchName = data.nome_fantasia || data.razao_social || "";
          tryFetchLogo(searchName.split(' ')[0]);
        }

        setFormData(prev => ({
          ...prev,
          nome: prev.nome || data.razao_social || data.nome_fantasia || "",
          cnpj: formatCNPJ(data.cnpj),
          contatos: [...prev.contatos, ...newContacts],
          enderecos: [...prev.enderecos, newAddress],
          logo_url: logo_url || prev.logo_url
        }));

        if (data.cep) {
          fetch(`https://brasilapi.com.br/api/cep/v2/${data.cep.replace(/\D/g, "")}`)
            .then(r => r.json())
            .then(coordsData => {
              if (coordsData.location?.coordinates && coordsData.location.coordinates.latitude) {
                setFormData(prev => {
                  const newE = [...prev.enderecos];
                  // We look for the address by index or CEP to be safe
                  if (newE[targetIdx]) {
                    newE[targetIdx].latitude = String(coordsData.location.coordinates.latitude);
                    newE[targetIdx].longitude = String(coordsData.location.coordinates.longitude);
                  }
                  return { ...prev, enderecos: newE };
                });
              } else {
                fetchFallbackCoordinates(targetIdx, newAddress.logradouro, newAddress.numero, newAddress.cidade, newAddress.estado);
              }
            }).catch(() => {
              fetchFallbackCoordinates(targetIdx, newAddress.logradouro, newAddress.numero, newAddress.cidade, newAddress.estado);
            });
        }
        showToast("Dados do CNPJ carregados com sucesso!", "success");
      }
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error);
    } finally {
      setIsFetchingCNPJ(false);
    }
  };

  const fetchCEPData = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, "");
    if (cleanCEP.length !== 8) return;

    setIsFetchingCEP(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCEP}`);
      if (response.ok) {
        const data = await response.json();
        const newAddress = {
          cep: formatCEP(data.cep || cleanCEP),
          logradouro: data.street || "",
          numero: "",
          bairro: data.neighborhood || "",
          complemento: "",
          cidade: data.city || "",
          estado: data.state || "",
          latitude: "",
          longitude: ""
        };
        setFormData(prev => ({
          ...prev,
          enderecos: [...prev.enderecos, newAddress]
        }));
        showToast("Endereço carregado via CEP!", "success");
      }
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    } finally {
      setIsFetchingCEP(false);
    }
  };

  const fetchFallbackCoordinates = async (index: number, logradouro: string, numero: string, cidade: string, estado: string) => {
    if (!logradouro || !cidade || !estado) return;
    
    const performSearch = async (addrStr: string) => {
      const query = encodeURIComponent(`${addrStr}, ${cidade}, ${estado}, Brasil`);
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      return await response.json();
    };

    try {
      // 1. Try with number if available
      const fullAddress = (numero && numero !== "SN") ? `${logradouro}, ${numero}` : logradouro;
      let data = await performSearch(fullAddress);

      // 2. If failed, try simplifying logradouro (remove Bloco, Torre, etc.)
      if ((!data || data.length === 0) && logradouro.includes(" ")) {
        const simplified = logradouro.split(/BLOCO|TORRE|SALA|KM/i)[0].trim();
        if (simplified !== logradouro) {
          data = await performSearch(simplified);
        }
      }

      // 3. Last resort: just the first two words of logradouro
      if (!data || data.length === 0) {
        const words = logradouro.split(" ");
        if (words.length > 2) {
          data = await performSearch(`${words[0]} ${words[1]}`);
        }
      }
      
      if (data && data.length > 0) {
        setFormData(prev => {
          const newE = [...prev.enderecos];
          if (newE[index]) {
            newE[index].latitude = data[0].lat;
            newE[index].longitude = data[0].lon;
          }
          return { ...prev, enderecos: newE };
        });
      }
    } catch (err) {
      console.error("Erro no fallback de geolocalização:", err);
    }
  };

  // Handle field change with validation
  const handleFieldChange = (field: string, value: string) => {
    // Validate on change
    let error = "";
    switch (field) {
      case "nome":
        error = validateNome(value);
        break;
      case "cnpj":
        error = validateCNPJ(value);
        break;
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));

    if (error) {
      setFieldErrors({ ...fieldErrors, [field]: error });
    } else {
      const newErrors = { ...fieldErrors };
      delete newErrors[field];
      setFieldErrors(newErrors);
      
      // Trigger CNPJ fetch if valid
      if (field === "cnpj" && value.replace(/\D/g, "").length === 14) {
        fetchCNPJData(value);
      }

      // Trigger CEP fetch if valid
      if (field === "cep" && value.replace(/\D/g, "").length === 8) {
        fetchCEPData(value);
      }
    }
  };

  // Validate all required fields before submit
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    errors["nome"] = validateNome(formData.nome);
    errors["tipo_contrato"] = validateTipoContrato(formData.tipo_contrato);
    
    if (formData.cnpj) {
      errors["cnpj"] = validateCNPJ(formData.cnpj);
    }
    
    // Remove empty errors
    const cleanErrors = Object.fromEntries(
      Object.entries(errors).filter(([_, v]) => v !== "")
    );
    
    setFieldErrors(cleanErrors);
    
    if (Object.keys(cleanErrors).length > 0) {
      showToast("Corrija os erros no formulário", "warning", 15000);
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    try {
      // Use a plain object for JSON submission
      const submitData = {
        nome: formData.nome.trim(),
        cnpj: formData.cnpj || "",
        tipo_contrato: formData.tipo_contrato,
        contatos: formData.contatos,
        enderecos: formData.enderecos,
        logo_url: formData.logo_url,
        ativo: formData.ativo,
      };
      
      let savedData: any;
      const FORNECEDOR_API = "/inventory/fornecedores/";
      
      try {
        const ensureTrailing = (u: string) => u.replace(/\/$/, "") + "/";
        if (fornecedorInitial?.id) {
          const url = ensureTrailing(FORNECEDOR_API) + `${fornecedorInitial.id}/`;
          if (process.env.NODE_ENV === "development") {
            console.debug(`[FORNECEDOR] PUT -> baseURL=${apiClient.defaults.baseURL} url=${url}`);
          }
          const { data } = await apiClient.put(url, submitData);
          savedData = data;
        } else {
          const url = ensureTrailing(FORNECEDOR_API);
          if (process.env.NODE_ENV === "development") {
            console.debug(`[FORNECEDOR] POST -> baseURL=${apiClient.defaults.baseURL} url=${url}`);
          }
          const { data } = await apiClient.post(url, submitData);
          savedData = data;
        }
      } catch (apiErr: any) {
        const status = apiErr.response?.status;
        const data = apiErr.response?.data;
        
        // In development show detailed error in console, otherwise keep logs minimal
        if (process.env.NODE_ENV === "development") {
          try {
            console.groupCollapsed("[DEV] Fornecedor API error");
            console.debug("Status:", status);
            // Only log JSON response bodies; avoid dumping HTML debug pages or full settings
            if (data && typeof data === "object") {
              console.debug("Data:", data);
            } else if (typeof data === "string") {
              const excerpt = data.length > 200 ? data.slice(0, 200) + "..." : data;
              console.debug("Data (excerpt):", excerpt);
            }
            console.debug("Message:", apiErr.message);
            console.groupEnd();
          } catch (logErr) {
            // avoid throwing while logging
            console.debug("Fornecedor logging error", logErr);
          }
        }

        let errorMessage = "Erro ao salvar fornecedor.";
        
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
          const messages = Object.entries(data)
            .map(([key, value]: [string, any]) => {
              let val = "";
              if (Array.isArray(value)) {
                val = value.join(", ");
              } else if (typeof value === "object") {
                val = JSON.stringify(value);
              } else {
                val = String(value);
              }
              return `${key}: ${val}`;
            })
            .filter(msg => msg.trim());
          
          if (messages.length > 0) {
            // Se houver erro de duplicidade, simplifica para o usuário
            const isDuplicate = messages.some(m => 
              m.toLowerCase().includes("já existe") || 
              m.toLowerCase().includes("unique") || 
              m.toLowerCase().includes("duplicated")
            );
            
            if (isDuplicate) {
              errorMessage = "Fornecedor já cadastrado no sistema.";
            } else {
              errorMessage = messages.join("\n");
            }
          }
        } else if (data?.detail) {
          errorMessage = `${data.detail}`;
        } else if (status) {
          errorMessage = `Erro ${status}: ${apiErr.message || "Falha ao salvar"}`;
        }
        
        showToast(errorMessage, "error", 15000);
        // Do not rethrow: we handled the error and showed feedback to the user.
        return;
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
                        <div className="position-relative">
                          <FormInput
                            label="CNPJ"
                            type="text"
                            placeholder="00.000.000/0001-00"
                            value={formData.cnpj}
                            onChange={(e) => handleFieldChange("cnpj", formatCNPJ(e.target.value))}
                            error={fieldErrors.cnpj}
                            icon={<FileText size={18} />}
                          />
                          {isFetchingCNPJ && (
                            <div className="position-absolute d-flex align-items-center gap-2" style={{ right: '10px', top: '38px' }}>
                              <div className="spinner-border spinner-border-sm text-primary" style={{ width: '14px', height: '14px' }} />
                              <span className="text-xs text-primary fw-medium">Buscando...</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-12">
                        <FormInput
                          label="Razão Social / Nome"
                          required
                          type="text"
                          placeholder="Ex: AgroNutri Alimentos Ltda"
                          value={formData.nome}
                          onChange={(e) => handleFieldChange("nome", e.target.value)}
                          error={fieldErrors.nome}
                          icon={<Building2 size={18} />}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Endereços Dinâmicos */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h3 className="fw-bold mb-0" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Endereços</h3>
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          enderecos: [...formData.enderecos, { 
                            cep: "", logradouro: "", numero: "", bairro: "", 
                            complemento: "", cidade: "", estado: "",
                            latitude: "", longitude: "" 
                          }]
                        })}
                        className="btn btn-sm btn-outline-primary rounded-pill px-3"
                      >
                        + Adicionar Endereço
                      </button>
                    </div>
                    
                    <div className="d-flex flex-column gap-3">
                      {formData.enderecos.map((addr, index) => (
                        <div key={index} className="p-3 border border-border rounded-xl bg-muted/30 position-relative">
                          <button
                            type="button"
                            onClick={() => {
                              const newE = formData.enderecos.filter((_, i) => i !== index);
                              setFormData({ ...formData, enderecos: newE });
                            }}
                            className="position-absolute top-0 end-0 p-2 text-danger border-0 bg-transparent"
                          >
                            <X size={16} />
                          </button>
                          
                          <div className="row g-2">
                            <div className="col-12 col-md-3">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">CEP</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="00000-000"
                                value={addr.cep || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  const val = formatCEP(e.target.value);
                                  newE[index].cep = val;
                                  setFormData({ ...formData, enderecos: newE });
                                  
                                  if (val.replace(/\D/g, "").length === 8) {
                                    fetch(`https://brasilapi.com.br/api/cep/v2/${val.replace(/\D/g, "")}`)
                                      .then(r => r.json())
                                      .then(d => {
                                        const updateE = [...formData.enderecos];
                                        updateE[index].logradouro = d.street || updateE[index].logradouro;
                                        updateE[index].bairro = d.neighborhood || updateE[index].bairro;
                                        updateE[index].cidade = d.city || updateE[index].cidade;
                                        updateE[index].estado = d.state || updateE[index].estado;
                                        if (d.location?.coordinates && d.location.coordinates.latitude) {
                                          updateE[index].latitude = d.location.coordinates.latitude;
                                          updateE[index].longitude = d.location.coordinates.longitude;
                                          setFormData({ ...formData, enderecos: updateE });
                                        } else {
                                          // Se CEP v2 falhar nas coordenadas, tenta Nominatim
                                          setFormData({ ...formData, enderecos: updateE });
                                          fetchFallbackCoordinates(index, d.street || updateE[index].logradouro, updateE[index].numero, d.city || updateE[index].cidade, d.state || updateE[index].estado);
                                        }
                                      });
                                  }
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-5">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Logradouro</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="Ex: Av. Brasil"
                                value={addr.logradouro || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].logradouro = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-2">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Número</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="1000"
                                value={addr.numero || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].numero = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-2">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Bairro</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="Ex: Centro"
                                value={addr.bairro || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].bairro = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-4">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Complemento</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="Ex: Bloco A"
                                value={addr.complemento || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].complemento = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-4">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Cidade</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                value={addr.cidade || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].cidade = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-2">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">UF</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                maxLength={2}
                                value={addr.estado || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].estado = e.target.value.toUpperCase();
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-6">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Latitude</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="-18.9310"
                                value={addr.latitude || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].latitude = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-6">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Longitude</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg"
                                placeholder="-48.2363"
                                value={addr.longitude || ""}
                                onChange={(e) => {
                                  const newE = [...formData.enderecos];
                                  newE[index].longitude = e.target.value;
                                  setFormData({ ...formData, enderecos: newE });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contatos Dinâmicos */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h3 className="fw-bold mb-0" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Contatos</h3>
                      <button
                        type="button"
                        onClick={() => setFormData({
                          ...formData,
                          contatos: [...formData.contatos, { label: "", valor: "", tipo: "telefone" }]
                        })}
                        className="btn btn-sm btn-outline-primary rounded-pill px-3"
                      >
                        + Adicionar
                      </button>
                    </div>
                    
                    <div className="d-flex flex-column gap-3">
                      {formData.contatos.map((contato, index) => (
                        <div key={index} className="p-3 border border-border rounded-xl bg-muted/30 position-relative">
                          <button
                            type="button"
                            onClick={() => {
                              const newC = formData.contatos.filter((_, i) => i !== index);
                              setFormData({ ...formData, contatos: newC });
                            }}
                            className="position-absolute top-0 end-0 p-2 text-danger border-0 bg-transparent"
                          >
                            <X size={16} />
                          </button>
                          
                          <div className="row g-2">
                            <div className="col-12 col-md-4">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Tipo</label>
                              <select 
                                className="form-select form-select-sm rounded-lg shadow-sm"
                                value={contato.tipo}
                                onChange={(e) => {
                                  const newC = [...formData.contatos];
                                  newC[index].tipo = e.target.value;
                                  setFormData({ ...formData, contatos: newC });
                                }}
                              >
                                <option value="telefone">Telefone</option>
                                <option value="email">E-mail</option>
                              </select>
                            </div>
                            <div className="col-12 col-md-4">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Etiqueta</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg shadow-sm"
                                placeholder="Ex: Financeiro"
                                value={contato.label}
                                onChange={(e) => {
                                  const newC = [...formData.contatos];
                                  newC[index].label = e.target.value;
                                  setFormData({ ...formData, contatos: newC });
                                }}
                              />
                            </div>
                            <div className="col-12 col-md-4">
                              <label className="text-xs fw-bold text-muted-foreground mb-1 d-block">Valor</label>
                              <input
                                type="text"
                                className="form-control form-control-sm rounded-lg shadow-sm"
                                placeholder={contato.tipo === 'email' ? 'email@empresa.com' : '(00) 00000-0000'}
                                value={contato.valor}
                                onChange={(e) => {
                                  const newC = [...formData.contatos];
                                  const val = e.target.value;
                                  if (contato.tipo === 'telefone' && val.replace(/\D/g, "").length >= 2) {
                                    newC[index].valor = formatPhone(val);
                                  } else {
                                    newC[index].valor = val;
                                  }
                                  setFormData({ ...formData, contatos: newC });
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tipo de Contrato */}
                  <div className="mb-4">
                    <h3 className="fw-bold mb-3" style={{ fontSize: "0.875rem", color: "var(--foreground)" }}>Modalidade de Contrato <span className="text-danger">*</span></h3>
                    {fieldErrors.tipo_contrato && <FormError message={fieldErrors.tipo_contrato} className="mb-3" />}
                    <div className="row g-2">
                      {tipoContratoOptions.map((tipo) => (
                        <div className="col-4" key={tipo.id}>
                          <button
                            type="button"
                            onClick={() => handleFieldChange("tipo_contrato", tipo.id)}
                            className={`w-100 p-3 rounded-xl border text-center transition-all ${
                              formData.tipo_contrato === tipo.id
                                ? 'border-success bg-success-subtle'
                                : fieldErrors.tipo_contrato && !formData.tipo_contrato
                                ? 'border-danger'
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