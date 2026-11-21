import { apiClient } from './api';

/** Vaccination and health records used by the livestock segments (the web clinic was removed). */

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
