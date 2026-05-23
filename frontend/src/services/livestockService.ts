import apiClient from "./api";

export const getReproductionDashboard = async (species: string) => {
  const response = await apiClient.get(`/livestock/dashboard/reproduction/?species=${species}`);
  return response.data;
};

export const getMarras = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/marras/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getMatrizes = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/matrizes/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getGestacoes = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/gestacoes/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getMaternidades = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/maternidades/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getAguardandoCobertura = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/aguardando-cobertura/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getCreches = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/creches/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getCrescimentos = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/crescimentos/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const getEngordas = async (species: string, page = 1, pageSize = 50) => {
  const response = await apiClient.get(`/livestock/engordas/?species=${species}&page=${page}&page_size=${pageSize}`);
  return response.data;
};

export const registerMating = async (animalId: string, data: any) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/register-mating/`, data);
  return response.data;
};

export const createAnimal = async (data: any) => {
  const response = await apiClient.post("/livestock/animals/", data);
  return response.data;
};

export const createMating = async (data: any) => {
  const { data: animals } = await apiClient.get(`/livestock/animals/?identifier=${encodeURIComponent(data.female_identifier)}`);
  const animalList = animals.results || animals;
  const animal = Array.isArray(animalList) ? animalList[0] : null;
  if (!animal) throw new Error("Animal não encontrado");
  const response = await apiClient.post(`/livestock/animals/${animal.id}/register-mating/`, {
    mating_date: data.mating_date,
    mating_type: data.mating_type,
    sire_info: data.sire_info || "",
    ...(data.sire_id ? { sire_id: data.sire_id } : {}),
  });
  return response.data;
};

export const getReproducers = async (species: string): Promise<{ id: number; identifier: string; category: string }[]> => {
  const response = await apiClient.get(`/livestock/animals/reproducers/?species=${species}`);
  return response.data;
};

export const createPregnancy = async (data: any) => {
  const response = await apiClient.post("/livestock/pregnancies/", data);
  return response.data;
};

export const createBirth = async (data: any) => {
  const response = await apiClient.post("/livestock/births/", data);
  return response.data;
};

export const createLitter = async (data: any) => {
  const response = await apiClient.post("/livestock/litters/", data);
  return response.data;
};

export const createAnimalBatch = async (data: any) => {
  const response = await apiClient.post("/livestock/batches/", data);
  return response.data;
};

export const updateAnimalBatch = async (id: number, data: any) => {
  const response = await apiClient.patch(`/livestock/batches/${id}/`, data);
  return response.data;
};

export const updateAnimal = async (id: number, data: any) => {
  const response = await apiClient.patch(`/livestock/animals/${id}/`, data);
  return response.data;
};

export const updatePregnancy = async (id: number, data: any) => {
  const response = await apiClient.patch(`/livestock/pregnancies/${id}/`, data);
  return response.data;
};

export const updateLitter = async (id: number, data: any) => {
  const response = await apiClient.patch(`/livestock/litters/${id}/`, data);
  return response.data;
};

export const batchWean = async (birthIds: number[], weanedQuantity?: number) => {
  const response = await apiClient.post("/livestock/births/batch_wean/", { birth_ids: birthIds, weaned_quantity: weanedQuantity });
  return response.data;
};

export const registerWeight = async (animalId: number | string, data: { weight_kg: number; weighing_date?: string; notes?: string }) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/register-weight/`, data);
  return response.data;
};

export const registerVaccination = async (animalId: number | string, data: { vaccine_name: string; application_date?: string; dose_type?: string; dosage_ml?: number; notes?: string }) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/register-vaccination/`, data);
  return response.data;
};

export const diagnosePregnancy = async (animalId: number | string, result: 'positive' | 'negative', diagnosisDate?: string) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/diagnose-pregnancy/`, { result, diagnosis_date: diagnosisDate });
  return response.data;
};

export const promoteToMating = async (animalId: number | string) => {
  const response = await apiClient.patch(`/livestock/animals/${animalId}/`, { reproductive_status: 'pronta' });
  return response.data;
};

export const discardAnimal = async (animalId: number | string, data: { data_descarte: string; motivo: string; peso?: number; valor_venda?: number; tipo_descarte: string; observacao?: string }) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/descartar-matriz/`, data);
  return response.data;
};

export const registerLoss = async (pregnancyId: number | string, data: any) => {
  const response = await apiClient.post(`/livestock/pregnancies/${pregnancyId}/registrar-perda/`, data);
  return response.data;
};

export const registerMortality = async (birthId: number | string, data: any) => {
  const response = await apiClient.post(`/livestock/births/${birthId}/registrar-mortalidade/`, data);
  return response.data;
};

export const registerProcedure = async (birthId: number | string, data: any) => {
  const response = await apiClient.post(`/livestock/births/${birthId}/registrar-procedimento/`, data);
  return response.data;
};

export const fetchAnimalDetails = async (id: string | number) => {
  try {
    const response = await apiClient.get(`/livestock/animals/${id}/`);
    return response.data;
  } catch {
    const response = await apiClient.get(`/livestock/batches/${id}/animal-detail/`);
    return response.data;
  }
};

export const fetchAnimalHistory = async (id: string | number) => {
  try {
    const response = await apiClient.get(`/livestock/animals/${id}/full-history/`);
    return response.data;
  } catch {
    const response = await apiClient.get(`/livestock/batches/${id}/animal-history/`);
    return response.data;
  }
};
