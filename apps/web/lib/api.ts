import { createApiClient } from "@repo/api-client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = createApiClient(API_BASE_URL);

export function mediaUrl(path: string | null | undefined) {
  if (!path) {
    return "";
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function apiErrorMessage(error: unknown, response: Response) {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (detail) {
      return JSON.stringify(detail);
    }
  }

  return `Request failed (${response.status} ${response.statusText})`;
}
