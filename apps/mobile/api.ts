import { Platform } from "react-native";

// Default base URL selection based on platform
const DEFAULT_HOST = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000";

let currentApiBaseUrl = DEFAULT_HOST;

export function getApiBaseUrl(): string {
  return currentApiBaseUrl;
}

export function setApiBaseUrl(url: string) {
  let cleaned = url.trim();
  if (cleaned.endsWith("/")) {
    cleaned = cleaned.slice(0, -1);
  }
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `http://${cleaned}`;
  }
  currentApiBaseUrl = cleaned;
}

export async function checkBackendHealth(): Promise<{ ok: boolean; statusText: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${currentApiBaseUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, statusText: data.service || "Connected" };
    }
    return { ok: false, statusText: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, statusText: e.name === "AbortError" ? "Timeout" : (e.message || "Unreachable") };
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${currentApiBaseUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text || "Invalid response from server" };
  }

  if (!response.ok) {
    const errorMsg = data.detail || (typeof data === "string" ? data : "API request failed");
    throw new Error(typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg));
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------------

export async function login(email: string, password: string) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  });
}

export async function getCurrentUser(token: string) {
  return apiRequest("/auth/me", { method: "GET" }, token);
}

// ---------------------------------------------------------------------------
// DASHBOARD & EXECUTIVE INTELLIGENCE
// ---------------------------------------------------------------------------

export async function getDashboardOverview(token: string) {
  return apiRequest("/dashboard/overview", { method: "GET" }, token);
}

export async function getExecutiveIntelligence(token: string) {
  return apiRequest("/executive/intelligence", { method: "GET" }, token);
}

export async function getOrgTree(token: string, regionId?: string) {
  const qs = regionId ? `?region_id=${encodeURIComponent(regionId)}` : "";
  return apiRequest(`/org-management/tree${qs}`, { method: "GET" }, token);
}

export async function getOrgRegions(token: string) {
  return apiRequest("/org-management/regions", { method: "GET" }, token);
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

export async function getCustomers(token: string, search?: string, region?: string) {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (region && region !== "ALL") params.append("city", region);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/customers/${qs}`, { method: "GET" }, token);
}

export async function createCustomer(
  token: string,
  payload: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    industry?: string;
    notes?: string;
    territory_id?: string;
  }
) {
  return apiRequest("/customers/", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

// ---------------------------------------------------------------------------
// VISITS
// ---------------------------------------------------------------------------

export async function getVisits(token: string, options?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (options?.status && options.status !== "ALL") {
    params.append("status_value", options.status);
  }
  if (options?.search) {
    params.append("search", options.search);
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/visits/${qs}`, { method: "GET" }, token);
}

export async function getVisitDetail(token: string, visitId: string) {
  return apiRequest(`/visits/${encodeURIComponent(visitId)}`, { method: "GET" }, token);
}

export async function createVisit(
  token: string,
  payload: {
    customer_id: string;
    territory_id?: string;
    visit_type?: string;
    status_value?: string;
    notes?: string;
  }
) {
  return apiRequest("/visits/", {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function updateVisit(
  token: string,
  visitId: string,
  payload: { status?: string; notes?: string }
) {
  return apiRequest(`/visits/${encodeURIComponent(visitId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

export async function getReports(token: string, options?: { status?: string; search?: string }) {
  const params = new URLSearchParams();
  if (options?.status && options.status !== "ALL") {
    params.append("status", options.status);
  }
  if (options?.search) {
    params.append("search", options.search);
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/reports/${qs}`, { method: "GET" }, token);
}

export async function getReportDraft(token: string, visitId: string, voiceNoteId?: string) {
  const qs = voiceNoteId ? `&voice_note_id=${encodeURIComponent(voiceNoteId)}` : "";
  return apiRequest(`/reports/draft?visit_id=${encodeURIComponent(visitId)}${qs}`, { method: "POST" }, token);
}

export async function editReport(
  token: string,
  reportId: string,
  payload: { title?: string; edited_report?: string }
) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/edit`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, token);
}

export async function submitReport(token: string, reportId: string, notes?: string) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  }, token);
}

export async function approveReport(token: string, reportId: string, notes?: string) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  }, token);
}

export async function rejectReport(token: string, reportId: string, rejection_reason: string) {
  return apiRequest(`/reports/${encodeURIComponent(reportId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejection_reason }),
  }, token);
}

// ---------------------------------------------------------------------------
// ACTION ITEMS & ALERTS
// ---------------------------------------------------------------------------

export async function getActionItems(token: string, options?: { status?: string; visit_id?: string }) {
  const params = new URLSearchParams();
  if (options?.status && options.status !== "ALL") params.append("status", options.status);
  if (options?.visit_id) params.append("visit_id", options.visit_id);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/action-items/${qs}`, { method: "GET" }, token);
}

export async function updateActionItemStatus(token: string, itemId: string, status: string) {
  return apiRequest(`/action-items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }, token);
}

export async function getAlerts(token: string, options?: { status?: string; visit_id?: string }) {
  const params = new URLSearchParams();
  if (options?.status && options.status !== "ALL") params.append("status", options.status);
  if (options?.visit_id) params.append("visit_id", options.visit_id);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/alerts/${qs}`, { method: "GET" }, token);
}

export async function updateAlertStatus(token: string, alertId: string, status: string) {
  return apiRequest(`/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }, token);
}

// ---------------------------------------------------------------------------
// LEADS
// ---------------------------------------------------------------------------

export async function getLeads(token: string, stage?: string) {
  const qs = stage && stage !== "ALL" ? `?stage=${encodeURIComponent(stage)}` : "";
  return apiRequest(`/leads/${qs}`, { method: "GET" }, token);
}

// ---------------------------------------------------------------------------
// VOICE NOTES
// ---------------------------------------------------------------------------

export async function getVoiceNoteStatus(token: string, voiceNoteId: string) {
  return apiRequest(`/voice-notes/${encodeURIComponent(voiceNoteId)}/status`, { method: "GET" }, token);
}

export async function uploadVoiceNoteFile(
  token: string,
  visitId: string,
  fileUriOrBlob: any,
  fileName: string = "recording.wav"
) {
  const formData = new FormData();
  formData.append("visit_id", visitId);

  if (typeof fileUriOrBlob === "string") {
    // React Native file object
    formData.append("file", {
      uri: fileUriOrBlob,
      name: fileName,
      type: "audio/wav",
    } as any);
  } else {
    formData.append("file", fileUriOrBlob, fileName);
  }

  const url = `${currentApiBaseUrl}/voice-notes/upload`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    throw new Error(data.detail || "Voice note upload failed");
  }

  return data;
}