import apiClient from "./api";

export const getReproductionDashboard = async (species: string) => {
  const response = await apiClient.get(`/livestock/dashboard/reproduction/?species=${species}`);
  return response.data;
};

export const registerMating = async (animalId: string, data: any) => {
  const response = await apiClient.post(`/livestock/animals/${animalId}/register-mating/`, data);
  return response.data;
};
