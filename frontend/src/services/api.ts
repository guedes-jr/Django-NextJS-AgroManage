/**
 * Axios API client with JWT interceptors.
 * Handles token refresh and error normalization.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { AuthTokens, ApiError } from "@/types";

const getBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl;
  
  return "/api/v1";
};

const BASE_URL = getBaseUrl();

export const getMediaUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/media/")) return path;
  if (path.startsWith("avatars/")) return `/media/${path}`;
  return `/media/${path}`;
};

if (process.env.NODE_ENV === "development") {
  console.log(`[API] Initialized with BASE_URL: ${BASE_URL}`);
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  timeout: 15000,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const access = localStorage.getItem("access_token");
      if (access && config.headers) {
        config.headers["Authorization"] = `Bearer ${access}`;
      }
    }
    
    // FormData: remove Content-Type header to let browser set multipart/form-data
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  pendingQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers!["Authorization"] = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) {
        localStorage.removeItem("access_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<AuthTokens>(`${BASE_URL}/auth/token/refresh/`, {
          refresh,
        });
        localStorage.setItem("access_token", data.access);
        processQueue(null, data.access);
        originalRequest.headers!["Authorization"] = `Bearer ${data.access}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const uploadFile = async (url: string, file: File, fieldName: string = "imagem") => {
  const formData = new FormData();
  formData.append(fieldName, file);
  
  const fullUrl = `${BASE_URL}${url}`;
  // axios.post automatically handles FormData and sets Content-Type correctly
  // Do not override headers for FormData requests
  const response = await apiClient.post(fullUrl, formData);
  return response;
};

export default apiClient;
