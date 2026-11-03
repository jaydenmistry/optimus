/**
 * API client for backend communication
 */

import type {
  OverviewResponse,
  SKUDetail,
  TransferRecommendationsResponse,
  Transfer,
  DemoStats,
  DemoPreview,
  PeakHoursDashboard
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Overview endpoints
  async getOverview(params?: {
    store_id?: number;
    risk_only?: boolean;
    min_confidence?: number;
    limit?: number;
  }): Promise<OverviewResponse> {
    const queryParams = new URLSearchParams();
    if (params?.store_id) queryParams.append('store_id', params.store_id.toString());
    if (params?.risk_only) queryParams.append('risk_only', 'true');
    if (params?.min_confidence) queryParams.append('min_confidence', params.min_confidence.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    return fetchAPI<OverviewResponse>(`/api/overview${query ? `?${query}` : ''}`);
  },

  async getAlerts() {
    return fetchAPI('/api/alerts');
  },

  // SKU endpoints
  async getSKUDetail(storeId: number, skuId: number, daysHistory = 30): Promise<SKUDetail> {
    return fetchAPI<SKUDetail>(`/api/sku/${storeId}/${skuId}?days_history=${daysHistory}`);
  },

  // Transfer endpoints
  async getTransferRecommendations(params?: {
    min_urgency?: number;
    limit?: number;
  }): Promise<TransferRecommendationsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.min_urgency) queryParams.append('min_urgency', params.min_urgency.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    return fetchAPI<TransferRecommendationsResponse>(`/api/transfers/recommendations${query ? `?${query}` : ''}`);
  },

  async getTransfers(params?: {
    status?: string;
    store_id?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.store_id) queryParams.append('store_id', params.store_id.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());

    const query = queryParams.toString();
    return fetchAPI<{ transfers: Transfer[]; total: number }>(`/api/transfers${query ? `?${query}` : ''}`);
  },

  async createTransferDraft(data: {
    from_store_id: number;
    to_store_id: number;
    sku_id: number;
    qty: number;
  }) {
    return fetchAPI('/api/transfers/draft', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTransferStatus(transferId: number, status: string) {
    return fetchAPI(`/api/transfers/${transferId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Demo data endpoints
  async getDemoStats(): Promise<DemoStats> {
    return fetchAPI<DemoStats>('/api/demo/stats');
  },

  async getDemoPreview(params?: {
    num_stores?: number;
    num_skus?: number;
    days_history?: number;
  }): Promise<DemoPreview> {
    const q = new URLSearchParams();
    if (params?.num_stores != null) q.append('num_stores', String(params.num_stores));
    if (params?.num_skus != null) q.append('num_skus', String(params.num_skus));
    if (params?.days_history != null) q.append('days_history', String(params.days_history));
    const query = q.toString();
    return fetchAPI<DemoPreview>(`/api/demo/preview${query ? `?${query}` : ''}`);
  },

  async regenerateDemoData(params?: {
    num_stores?: number;
    num_skus?: number;
    days_history?: number;
  }) {
    return fetchAPI('/api/demo/regenerate', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    });
  },

  // Peak hours endpoints
  async getPeakHoursDashboard(storeId: number): Promise<PeakHoursDashboard> {
    return fetchAPI<PeakHoursDashboard>(`/api/peak-hours/${storeId}`);
  },

  async getPrepSchedule(storeId: number, prepLeadTime = 2) {
    return fetchAPI(`/api/prep-schedule/${storeId}?prep_lead_time=${prepLeadTime}`);
  },

  async getSKUHourlyForecast(storeId: number, skuId: number) {
    return fetchAPI(`/api/sku/${storeId}/${skuId}/hourly`);
  },

  // Health check
  async healthCheck() {
    return fetchAPI('/api/health');
  },
};
