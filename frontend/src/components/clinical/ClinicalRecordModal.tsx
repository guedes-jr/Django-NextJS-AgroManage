'use client';

import { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { clinicalService, Disease, Symptom } from '@/services/clinicalService';
import { useToast } from '@/components/ui/Toast';

interface ClinicalRecordModalProps {
  animalId: string;
  farmId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ClinicalRecordModal({
  animalId,
  farmId,
  onClose,
  onSuccess,
}: ClinicalRecordModalProps) {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);

  const [formData, setFormData] = useState({
    record_type: 'consultation',
    record_date: new Date().toISOString().split('T')[0],
    disease: '',
    severity: 'moderate',
    clinical_notes: '',
    veterinarian: '',
  });

  useEffect(() => {
    // Load Diseases and Symptoms for autocomplete
    clinicalService.getDiseases().then((res) => setDiseases(res.data)).catch(console.error);
    clinicalService.getSymptoms().then((res) => setSymptoms(res.data)).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await clinicalService.createClinicalRecord({
        ...formData,
        animal: animalId,
        farm: farmId,
        disease: formData.disease ? parseInt(formData.disease) : null,
      });
      showToast('Ficha Clínica registrada com sucesso!', 'success');
      onSuccess();
    } catch (error: any) {
      console.error(error);
      showToast(error.response?.data?.message || 'Erro ao registrar ficha clínica', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header border-bottom-0 pb-0">
            <h5 className="modal-title fw-bold text-agro-dark">Nova Ficha Clínica</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium text-muted">Tipo de Registro</label>
                  <select
                    value={formData.record_type}
                    onChange={(e) => setFormData({ ...formData, record_type: e.target.value })}
                    className="form-select bg-light"
                    required
                  >
                    <option value="consultation">Consulta de Rotina</option>
                    <option value="diagnosis">Diagnóstico</option>
                    <option value="treatment">Tratamento</option>
                    <option value="follow_up">Acompanhamento</option>
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-medium text-muted">Data</label>
                  <input
                    type="date"
                    value={formData.record_date}
                    onChange={(e) => setFormData({ ...formData, record_date: e.target.value })}
                    className="form-control bg-light"
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-medium text-muted">Diagnóstico (Opcional)</label>
                  <select
                    value={formData.disease}
                    onChange={(e) => setFormData({ ...formData, disease: e.target.value })}
                    className="form-select bg-light"
                  >
                    <option value="">Selecione uma patologia...</option>
                    {diseases.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small fw-medium text-muted">Gravidade</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    className="form-select bg-light"
                  >
                    <option value="mild">Leve</option>
                    <option value="moderate">Moderada</option>
                    <option value="severe">Grave</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label small fw-medium text-muted">Notas Clínicas</label>
                  <textarea
                    value={formData.clinical_notes}
                    onChange={(e) => setFormData({ ...formData, clinical_notes: e.target.value })}
                    className="form-control bg-light"
                    rows={4}
                    placeholder="Descreva os sintomas observados e as recomendações..."
                    required
                  />
                </div>
                
                <div className="col-12">
                  <label className="form-label small fw-medium text-muted">Veterinário Responsável (Opcional)</label>
                  <input
                    type="text"
                    value={formData.veterinarian}
                    onChange={(e) => setFormData({ ...formData, veterinarian: e.target.value })}
                    className="form-control bg-light"
                    placeholder="Nome do Médico Veterinário (CRMV)"
                  />
                </div>

              </div>
            </div>

            <div className="modal-footer border-top-0 pt-0">
              <button
                type="button"
                className="btn btn-light px-4"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary px-4 d-flex align-items-center gap-2"
                disabled={isLoading}
              >
                <Save size={18} />
                {isLoading ? 'Salvando...' : 'Salvar Ficha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
