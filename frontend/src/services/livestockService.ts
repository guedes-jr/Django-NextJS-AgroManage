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
  });
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

export const updateLitter = async (id: number, data: any) => {
  const response = await apiClient.patch(`/livestock/litters/${id}/`, data);
  return response.data;
};

export const batchWean = async (birthIds: number[], weanedQuantity?: number) => {
  const response = await apiClient.post("/livestock/births/batch_wean/", { birth_ids: birthIds, weaned_quantity: weanedQuantity });
  return response.data;
};
