import type {
  Campaign,
  CampaignIn,
  DashboardData,
  ErrorLog,
  GenerateSearchesIn,
  ImportIn,
  BulkTextIn,
  ImportRun,
  Lead,
  LeadFilters,
  LeadPage,
  LeadPatch,
  LeadStatus,
  RunDetail,
  SearchTask,
  SearchTaskStatus,
} from '../types/api';

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://127.0.0.1:8000';

export class ApiError extends Error {
  status: number;
  detail: string | unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(
      0,
      `Cannot connect to backend server at ${API_BASE_URL}. Ensure the backend is running. (${message})`
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
    } else if (typeof data === 'string' && data) {
      message = data;
    }
    throw new ApiError(res.status, message, data?.detail || data);
  }

  return data as T;
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      q.append(key, String(val));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  async getHealth(): Promise<{ status: string }> {
    return request<{ status: string }>('/api/health');
  },

  async getDashboard(): Promise<DashboardData> {
    return request<DashboardData>('/api/dashboard');
  },

  // Campaigns
  async getCampaigns(): Promise<Campaign[]> {
    return request<Campaign[]>('/api/campaigns');
  },

  async getCampaign(id: number): Promise<Campaign> {
    return request<Campaign>(`/api/campaigns/${id}`);
  },

  async createCampaign(payload: CampaignIn): Promise<Campaign> {
    return request<Campaign>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCampaign(id: number, payload: CampaignIn): Promise<Campaign> {
    return request<Campaign>(`/api/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteCampaign(id: number): Promise<void> {
    return request<void>(`/api/campaigns/${id}`, {
      method: 'DELETE',
    });
  },

  // Search Tasks
  async generateSearches(
    campaignId: number,
    payload?: GenerateSearchesIn
  ): Promise<SearchTask[]> {
    return request<SearchTask[]>(`/api/campaigns/${campaignId}/generate-searches`, {
      method: 'POST',
      body: JSON.stringify(payload || { date_posted: 'past-week', max_queries: 40 }),
    });
  },

  async getSearchTasks(
    campaignId: number,
    status?: SearchTaskStatus
  ): Promise<SearchTask[]> {
    const q = buildQuery({ status });
    return request<SearchTask[]>(`/api/campaigns/${campaignId}/search-tasks${q}`);
  },

  async patchSearchTask(
    taskId: number,
    status: SearchTaskStatus
  ): Promise<SearchTask> {
    return request<SearchTask>(`/api/search-tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Imports
  async importItems(payload: ImportIn): Promise<ImportRun> {
    return request<ImportRun>('/api/imports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async importBulkText(payload: BulkTextIn): Promise<ImportRun> {
    return request<ImportRun>('/api/imports/bulk-text', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async importCsv(formData: FormData): Promise<ImportRun> {
    return request<ImportRun>('/api/imports/csv', {
      method: 'POST',
      body: formData,
    });
  },

  // Leads
  async getLeads(
    filters: LeadFilters = {},
    page = 1,
    pageSize = 25
  ): Promise<LeadPage> {
    const query = buildQuery({
      ...filters,
      page,
      page_size: pageSize,
    });
    return request<LeadPage>(`/api/leads${query}`);
  },

  async getLead(id: number): Promise<Lead> {
    return request<Lead>(`/api/leads/${id}`);
  },

  async patchLead(id: number, payload: LeadPatch): Promise<Lead> {
    return request<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async deleteLead(id: number): Promise<void> {
    return request<void>(`/api/leads/${id}`, {
      method: 'DELETE',
    });
  },

  async bulkUpdateStatus(
    ids: number[],
    status: LeadStatus
  ): Promise<{ updated: number }> {
    return request<{ updated: number }>('/api/leads/bulk-status', {
      method: 'POST',
      body: JSON.stringify({ ids, status }),
    });
  },

  getExportCsvUrl(filters: LeadFilters = {}): string {
    const query = buildQuery(filters as Record<string, any>);
    return `${API_BASE_URL}/api/leads/export.csv${query}`;
  },

  // Runs
  async getRuns(
    status?: string,
    campaignId?: number,
    limit = 50
  ): Promise<ImportRun[]> {
    const query = buildQuery({ status, campaign_id: campaignId, limit });
    return request<ImportRun[]>(`/api/runs${query}`);
  },

  async getRun(id: number): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${id}`);
  },

  async retryRun(id: number): Promise<RunDetail> {
    return request<RunDetail>(`/api/runs/${id}/retry`, {
      method: 'POST',
    });
  },

  // Errors
  async getErrors(
    runId?: number,
    level?: string,
    unresolvedOnly?: boolean,
    limit = 100
  ): Promise<ErrorLog[]> {
    const query = buildQuery({
      run_id: runId,
      level,
      unresolved_only: unresolvedOnly || undefined,
      limit,
    });
    return request<ErrorLog[]>(`/api/errors${query}`);
  },
};
