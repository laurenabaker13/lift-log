import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";
import { shouldAttachBearerSession } from "./session-transport";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

const DEFAULT_API_TIMEOUT_MS = 20_000;
const SESSION_CHECK_TIMEOUT_MS = 8_000;
const PLAN_IMPORT_TIMEOUT_MS = 120_000;
const MAX_PASTED_PLAN_TEXT_BYTES = 256 * 1024;

function browserOrigin() {
  return Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined;
}

function usesBearerSession(baseUrl: string) {
  return shouldAttachBearerSession({ platform: Platform.OS, apiBaseUrl: baseUrl, browserOrigin: browserOrigin() });
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: RequestInit = {},
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = options.signal;
  let didTimeout = false;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) controller.abort();
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout) {
      throw new Error("Lift Log is taking longer than usual. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function apiCall<T>(endpoint: string, options: RequestInit = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Native uses a stored Bearer token. Web prefers the API's HTTP-only cookie,
  // but includes the same issued token when browser privacy settings block a
  // cross-origin API cookie (such as an embedded Preview).
  const baseUrl = getApiBaseUrl();
  const sessionToken = usesBearerSession(baseUrl) ? await Auth.getSessionToken() : null;
  if (sessionToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
  }

  // Ensure no double slashes between baseUrl and endpoint
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;
  try {
    console.log("[API] Making request...");
    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
      credentials: "include",
    }, timeoutMs);

    console.log("[API] Response received");
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API] Error response received");
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // Not JSON, use text as is
      }
      throw new Error(errorMessage || `API call failed: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      console.log("[API] JSON response received");
      return data as T;
    }

    const text = await response.text();
    console.log("[API] Text response received");
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    console.error("[API] Request failed");
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred");
  }
}

// OAuth callback handler - exchange code for session token
// Calls /api/oauth/mobile endpoint which returns JSON with app_session_id and user
export async function exchangeOAuthCode(
  code: string,
  state: string,
): Promise<{ sessionToken: string; user: any }> {
  console.log("[API] exchangeOAuthCode called");
  // Use GET with query params
  const params = new URLSearchParams({ code, state });
  const endpoint = `/api/oauth/mobile?${params.toString()}`;
  console.log("[API] Calling OAuth mobile endpoint");
  const result = await apiCall<{ app_session_id: string; user: any }>(endpoint);

  // Convert app_session_id to sessionToken for compatibility
  const sessionToken = result.app_session_id;
  console.log("[API] OAuth exchange completed");

  return {
    sessionToken,
    user: result.user,
  };
}

// Logout
export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", {
    method: "POST",
  });
}

// Get current authenticated user (web uses cookie-based auth)
export async function getMe(): Promise<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
} | null> {
  try {
    const baseUrl = getApiBaseUrl();
    const url = baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/auth/me` : "/api/auth/me";
    const sessionToken = usesBearerSession(baseUrl) ? await Auth.getSessionToken() : null;
    // A 401 is the normal state before a user signs in. Avoid routing this expected
    // check through apiCall, which correctly treats action failures as console errors.
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      credentials: "include",
    }, SESSION_CHECK_TIMEOUT_MS);
    if (response.status === 401) return null;
    if (!response.ok) return null;
    const result = (await response.json()) as { user?: any };
    return result.user || null;
  } catch {
    return null;
  }
}

export type EmailAuthResponse = {
  app_session_id: string;
  user: {
    id: number;
    openId: string;
    name: string | null;
    email: string | null;
    loginMethod: string | null;
    lastSignedIn: string;
  };
};

export async function registerWithEmail(input: {
  displayName: string;
  email: string;
  password: string;
}): Promise<EmailAuthResponse> {
  return apiCall<EmailAuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginWithEmail(input: {
  email: string;
  password: string;
}): Promise<EmailAuthResponse> {
  return apiCall<EmailAuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Establish session cookie on the backend (3000-xxx domain)
// Called after receiving token via postMessage to get a proper Set-Cookie from the backend
export async function establishSession(token: string): Promise<boolean> {
  try {
    console.log("[API] establishSession: setting cookie on backend...");
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Important: allows Set-Cookie to be stored
    });

    if (!response.ok) {
      console.error("[API] establishSession failed");
      return false;
    }

    console.log("[API] establishSession: cookie set successfully");
    return true;
  } catch {
    console.error("[API] establishSession error");
    return false;
  }
}

export async function uploadPlanDocument(input: {
  fileName: string;
  mimeType: string;
  base64: string;
}): Promise<{ id: number; sourceUrl: string }> {
  return apiCall<{ id: number; sourceUrl: string }>("/api/plan-import/upload", {
    method: "POST",
    body: JSON.stringify(input),
  }, PLAN_IMPORT_TIMEOUT_MS);
}

function encodeUtf8Base64(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (!bytes.length) throw new Error("Paste your trainer's workout text first.");
  if (bytes.byteLength > MAX_PASTED_PLAN_TEXT_BYTES) throw new Error("Keep pasted workout text under 256 KB.");

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
    encoded += second === undefined ? "=" : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
    encoded += third === undefined ? "=" : alphabet[third & 63];
  }
  return encoded;
}

export async function uploadPastedPlanText(text: string): Promise<{ id: number; sourceUrl: string }> {
  return uploadPlanDocument({
    fileName: "pasted-trainer-plan.txt",
    mimeType: "text/plain",
    base64: encodeUtf8Base64(text),
  });
}

export type PlanImportAnalysis = {
  importId: number;
  planName: string;
  trainerNotes: string;
  weeks: Array<{
    name: string;
    workouts: Array<{
      dayOfWeek: number;
      name: string;
      exercises: Array<{
        name: string;
        equipment: string;
        prescriptionMode: "percent" | "weight";
        intensityPercent: number | null;
        plannedWeight: number | null;
        weightUnit: "lb" | "kg" | null;
        targetRpe: number | null;
        sets: Array<{ targetReps: number }>;
      }>;
    }>;
  }>;
  uncertainItems: string[];
};

export async function analyzePlanDocument(importId: number): Promise<PlanImportAnalysis> {
  return apiCall<PlanImportAnalysis>("/api/plan-import/analyze", {
    method: "POST",
    body: JSON.stringify({ importId }),
  }, PLAN_IMPORT_TIMEOUT_MS);
}


export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  return apiCall<{ ok: boolean; message: string }>("/api/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<{ ok: boolean; message: string }> {
  return apiCall<{ ok: boolean; message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function verifyEmail(token: string): Promise<{ ok: boolean; message: string }> {
  return apiCall<{ ok: boolean; message: string }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function resendVerificationEmail(): Promise<{ ok: boolean; message: string }> {
  return apiCall<{ ok: boolean; message: string }>("/api/auth/resend-verification", {
    method: "POST",
  });
}
