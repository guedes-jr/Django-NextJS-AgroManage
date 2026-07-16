/**
 * Axios API client with JWT interceptors.
 * Handles token refresh and error normalization.
 */
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { AuthTokens, ApiError } from "@/types";

const computeBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
  return envUrl.endsWith("/") ? envUrl : envUrl + "/";
};

const BASE_URL = computeBaseUrl();

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
    let access: string | null = null;

    if (typeof window !== "undefined") {
      access = localStorage.getItem("support_access_token") || localStorage.getItem("access_token");

      const isPublicRoute = 
        config.url?.includes("/auth/login") || 
        config.url?.includes("/auth/register") || 
        config.url?.includes("/auth/password-recovery") ||
        config.url?.includes("/auth/token/refresh");

      if (access && config.headers && !isPublicRoute) {
        config.headers["Authorization"] = `Bearer ${access}`;
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[API Request]", {
        method: config.method,
        baseURL: config.baseURL,
        url: config.url,
        hasAccessToken: Boolean(access),
        hasAuthorizationHeader: Boolean(config.headers?.Authorization),
      });
    }

    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    try {
      const method = (config.method || "").toString().toLowerCase();

      if (["post", "put", "patch"].includes(method) && typeof config.url === "string") {
        const url = config.url;
        const looksLikeFile = /\.[a-zA-Z0-9]+(\?|$)/.test(url);

        if (!url.endsWith("/") && !looksLikeFile) {
          config.url = `${url}/`;
        }
      }
    } catch {
      // ignore
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
      if (localStorage.getItem("support_access_token")) {
        localStorage.removeItem("support_access_token");
        localStorage.removeItem("support_context");
        window.location.href = "/platform/organizations";
        return Promise.reject(error);
      }
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
        
        // Se for uma rota de auth (login/register) falhando com 401, 
        // não redirecionamos para não entrar em loop ou refresh de página.
        const isAuthRoute = 
          originalRequest.url?.includes("/auth/login") || 
          originalRequest.url?.includes("/auth/register");

        if (!isAuthRoute && typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<AuthTokens>(`${BASE_URL}auth/token/refresh/`, {
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
  
  const response = await apiClient.post(url, formData);
  return response;
};

export default apiClient;
