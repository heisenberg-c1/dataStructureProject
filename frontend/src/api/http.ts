import axios, { AxiosError } from "axios";

import type { ApiErrorShape } from "@/types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const httpClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
  },
});

export function normalizeApiError(error: unknown): ApiErrorShape {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    return {
      status: axiosError.response?.status ?? 0,
      message: axiosError.response?.data?.detail ?? axiosError.message,
    };
  }
  if (error instanceof Error) {
    return { status: 0, message: error.message };
  }
  return { status: 0, message: "Unknown error" };
}
