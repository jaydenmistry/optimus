/**
 * TypeScript type definitions for the application
 */

export interface Store {
  id: number;
  name: string;
  location?: string;
}

export interface SKU {
  id: number;
  name: string;
  category: string;
  cost?: number;
  price?: number;
  is_perishable: boolean;
}

export interface InventoryItem {
  store_id: number;
  store_name: string;
  sku_id: number;
  sku_name: string;
  category: string;
  on_hand: number;
  daily_demand: number;
  days_of_cover: number;
  stockout_date: string | null;
  confidence_score: number;
  confidence_grade: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  suggested_action: string;
}

export interface OverviewResponse {
  items: InventoryItem[];
  total: number;
  alerts: {
    critical_stockouts: number;
    low_confidence: number;
    transfer_opportunities: number;
  };
  filters: {
    store_id: number | null;
    risk_only: boolean;
    min_confidence: number;
  };
}

export interface SKUDetail {
  store: Store;
  sku: SKU;
  current_state: {
    on_hand: number;
    daily_demand: number;
    days_of_cover: number;
    stockout_date: string | null;
    confidence_score: number;
    confidence_grade: string;
  };
  forecast: {
    daily_demand: number;
    demand_std: number;
    weekday_avg: number;
    weekend_avg: number;
    confidence: string;
    data_points: number;
    next_7_days: Array<{
      date: string;
      predicted_demand: number;
      is_weekend: boolean;
    }>;
  };
  history: Array<{
    date: string;
    on_hand: number;
    sales: number;
  }>;
  anomalies: Array<{
    date: string;
    residual: number;
    severity: string;
    explanation: string;
  }>;
  anomaly_patterns: {
    has_pattern: boolean;
    pattern_type: string | null;
    frequency: number;
    total_loss: number;
  };
  confidence_details: {
    score: number;
    grade: string;
    deductions: string[];
    anomaly_count: number;
    days_since_count: number | null;
    has_systematic_pattern: boolean;
  };
  recommendations: {
    reorder: {
      recommended: boolean;
      qty: number;
      reorder_point: number;
      reason: string;
    };
    transfer: {
      recommended: boolean;
      reason: string | null;
    };
    cycle_count: {
      recommended: boolean;
      priority: string;
      reason: string;
    };
  };
}

export interface TransferRecommendation {
  from_store_id: number;
  from_store_name: string;
  to_store_id: number;
  to_store_name: string;
  sku_id: number;
  sku_name: string;
  qty: number;
  urgency_score: number;
  rationale: string;
  distance_km: number | null;
  transfer_cost: number | null;
  receiver_days_before: number;
  receiver_days_after: number;
  donor_days_before: number;
  donor_days_after: number;
}

export interface TransferRecommendationsResponse {
  recommendations: TransferRecommendation[];
  grouped_by_receiver: Record<string, TransferRecommendation[]>;
  total: number;
  summary: {
    total_opportunities: number;
    high_urgency: number;
    medium_urgency: number;
    low_urgency: number;
    total_units: number;
    estimated_savings: number;
  };
}

export interface Transfer {
  id: number;
  from_store_id: number;
  from_store_name: string;
  to_store_id: number;
  to_store_name: string;
  sku_id: number;
  sku_name: string;
  qty: number;
  status: string;
  created_at: string;
  received_at: string | null;
}

export interface DemoStats {
  stores: number;
  skus: number;
  inventory_snapshots: number;
  sales_records: number;
  total_sales_hourly?: number;
  anomalies: number;
  transfer_recommendations: number;
  date_range?: {
    start: string;
    end: string;
    days: number;
  };
}

/** What the demo data generator will create (from GET /api/demo/preview) */
export interface DemoPreview {
  stores: number;
  store_names: string[];
  skus: number;
  categories: string[];
  days_history: number;
  inventory_snapshots_approx: number;
  receipt_chance_pct: number;
  anomalies_approx: number;
  cycle_recent_pct: number;
  cycle_older_pct: number;
  cycle_none_pct: number;
  transfer_recommendations_approx: string;
  sales_hourly_days: number;
  sales_hourly_categories: string[];
  sales_hourly_skus_per_store: number;
  telemetry_sensors: number;
  telemetry_description: string;
}

export interface HourlyForecast {
  hour: number;
  hour_display: string;
  predicted_demand: number;
  is_peak_hour: boolean;
  peak_period: string | null;
  confidence: string;
}

export interface StockoutPrediction {
  will_stockout: boolean;
  stockout_time?: string;
  stockout_hour?: number;
  hours_until_stockout?: number;
  minutes_until_stockout?: number;
  is_during_peak?: boolean;
  peak_period?: string;
  severity?: string;
  deficit?: number;
  safe_until?: string;
  remaining_at_close?: number;
}

export interface PrepRecommendation {
  sku_id: number;
  sku_name: string;
  category: string;
  prep_time: string;
  prep_time_display: string;
  qty_to_prep: number;
  reason: string;
  priority: string;
  current_on_hand: number;
  stockout_time: string;
  is_peak_stockout: boolean;
  hours_until_prep: number;
}

export interface PeakHourSummary {
  current_time: string;
  current_hour: number;
  next_peak_period: string;
  next_peak_hour: number;
  hours_until_peak: number;
  minutes_until_peak: number;
  is_currently_peak: boolean;
  at_risk_items: Array<{
    sku_name: string;
    stockout_time: string;
    hours_until: number;
    peak_period: string;
  }>;
  total_at_risk: number;
}

export interface PeakHoursDashboard {
  store: Store;
  summary: PeakHourSummary;
  prep_schedule: PrepRecommendation[];
  critical_items: Array<{
    sku_id: number;
    sku_name: string;
    category: string;
    on_hand: number;
    stockout_prediction: StockoutPrediction;
    hourly_forecast: HourlyForecast[];
  }>;
  total_prep_tasks: number;
}

/** GET /api/sku/{store}/{sku}/hourly */
export interface SKUHourlyForecast {
  store: { id: number; name: string };
  sku: { id: number; name: string; category: string };
  current_on_hand: number;
  hourly_forecast: Array<HourlyForecast & { remaining_inventory?: number; will_stockout_this_hour?: boolean }>;
  stockout_prediction: StockoutPrediction;
}
