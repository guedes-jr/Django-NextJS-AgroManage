import { apiClient } from './api';

export interface Symptom {
  id: number;
  name: string;
  code: string;
  urgency_level: string;
}

export interface Disease {
  id: number;
  name: string;
  code: string;
  description: string;
  symptoms: Symptom[];
  recommended_treatment: string;
  incubation_period_days: number | null;
  mortality_rate: number | null;
  is_infectious: boolean;
  is_reportable: boolean;
}

export interface ClinicalRecord {
  id: number;
  farm: string;
  animal: string;
  animal_identifier: string;
  record_type: string;
  record_date: string;
  record_time: string | null;
  symptoms_observed: any[];
  clinical_notes: string;
  disease: number | null;
  disease_name: string | null;
  severity: string;
  prescribed_medications: any[];
  outcome: string;
  veterinarian: string;
  created_at: string;
}

export interface MedicationInventory {
  id: number;
  farm: string;
  medication_name: string;
  dosage: string;
  quantity_available: number;
  expiry_date: string;
  unit_cost: number;
  supplier: string;
  is_available: boolean;
  days_to_expiry: number;
}

export interface SanitaryAlert {
  id: number;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  created_date: string;
}

export interface VaccinationRecord {
  id: number;
  farm: string;
  species: string;
  animal: number | null;
  animal_identifier: string | null;
  batch: number | null;
  batch_code: string | null;
  vaccine_name: string;
  application_date: string;
  next_dose_date: string | null;
  dose_type: string;
  dosage_ml: number | null;
  batch_number: string;
  applicator: string;
  notes: string;
}

export interface HealthRecord {
  id: number;
  farm: string;
  animal: number;
  animal_identifier: string;
  treatment_type: string;
  treatment_type_display: string;
  description: string;
  application_date: string;
  veterinary: string;
  cost: number | null;
  notes: string;
}

export const clinicalService = {
  // Registros Clínicos
  getClinicalRecords: (filters: any = {}) =>
    apiClient.get('/livestock/clinical/records/', { params: filters }),
  
  createClinicalRecord: (data: any) =>
    apiClient.post('/livestock/clinical/records/', data),
  
  getClinicalRecord: (id: number) =>
    apiClient.get(`/livestock/clinical/records/${id}/`),
  
  updateClinicalRecord: (id: number, data: any) =>
    apiClient.patch(`/livestock/clinical/records/${id}/`, data),
  
  // Doenças
  getDiseases: (speciesId?: string) => {
    const params = speciesId ? { species: speciesId } : {};
    return apiClient.get('/livestock/diseases/', { params });
  },
  
  // Medicamentos
  getMedications: (filters: any = {}) =>
    apiClient.get('/livestock/medications/', { params: filters }),
  
  getMedicationsExpiringSoon: () =>
    apiClient.get('/livestock/medications/expiring_soon/'),
  
  // Alertas
  getAlerts: (filters: any = {}) =>
    apiClient.get('/livestock/alerts/', { params: filters }),
  
  // Sintomas
  getSymptoms: (search?: string) => {
    const params = search ? { search } : {};
    return apiClient.get('/livestock/symptoms/', { params });
  },

  // Vacinas
  getVaccinations: (filters: any = {}) =>
    apiClient.get('/livestock/vaccinations/', { params: filters }),
  
  createVaccination: (data: any) =>
    apiClient.post('/livestock/vaccinations/', data),

  // Registros de Saúde / Exames
  getHealthRecords: (filters: any = {}) =>
    apiClient.get('/livestock/health/records/', { params: filters }),
  
  createHealthRecord: (data: any) =>
    apiClient.post('/livestock/health/records/', data),
};
