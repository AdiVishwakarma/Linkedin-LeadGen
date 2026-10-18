export type ServiceCategory =
  | 'influencer_marketing'
  | 'ad_agency'
  | 'production_house'
  | 'brand_film'
  | 'other';

export type LeadStatus = 'new' | 'reviewed' | 'shortlisted' | 'rejected';

export type IntentLabel = 'high' | 'medium' | 'low' | 'not_a_lead';

export type RunStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'interrupted';

export type SearchTaskStatus = 'pending' | 'done' | 'skipped';

export type SortableField =
  | 'captured_at'
  | 'posted_at'
  | 'relevance'
  | 'intent'
  | 'author'
  | 'category'
  | 'status';

export interface Campaign {
  id: number;
  name: string;
  description: string | null;
  service_categories: string[];
  keywords: string[];
  exclude_keywords: string[];
  locations: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lead_count: number;
  pending_searches: number;
}

export interface CampaignIn {
  name: string;
  description?: string | null;
  service_categories: string[];
  keywords: string[];
  exclude_keywords: string[];
  locations: string[];
  is_active: boolean;
}

export interface SearchTask {
  id: number;
  campaign_id: number;
  query_text: string;
  search_url: string;
  service_category: string | null;
  status: SearchTaskStatus;
  posts_added: number;
  created_at: string;
  completed_at: string | null;
}

export interface GenerateSearchesIn {
  date_posted: 'past-24h' | 'past-week' | 'past-month';
  max_queries: number;
}

export interface ImportItem {
  url: string;
  text: string;
  author_name?: string | null;
  author_headline?: string | null;
  author_profile_url?: string | null;
  company?: string | null;
  location?: string | null;
  posted_at?: string | null;
}

export interface ImportIn {
  campaign_id?: number | null;
  search_task_id?: number | null;
  items: ImportItem[];
}

export interface BulkTextIn {
  campaign_id?: number | null;
  search_task_id?: number | null;
  raw_text: string;
}

export interface ErrorLog {
  id: number;
  run_id: number | null;
  level: 'error' | 'warning' | 'info';
  stage: string;
  message: string;
  payload: Record<string, unknown> | null;
  resolved: boolean;
  created_at: string;
}

export interface ImportRun {
  id: number;
  campaign_id: number | null;
  search_task_id: number | null;
  source: string;
  status: RunStatus;
  total: number;
  created: number;
  duplicates: number;
  near_duplicates: number;
  failed: number;
  started_at: string;
  finished_at: string | null;
}

export interface RunDetail extends ImportRun {
  errors: ErrorLog[];
}

export interface Lead {
  id: number;
  campaign_id: number | null;
  import_run_id: number | null;
  source_url: string;
  post_id: string | null;
  content: string;
  author_name: string | null;
  author_display: string | null;
  author_headline: string | null;
  author_profile_url: string | null;
  company: string | null;
  location: string | null;
  posted_at: string | null;
  captured_at: string;
  service_category: string;
  relevance_score: number;
  intent_score: number;
  intent_label: IntentLabel;
  is_india: boolean;
  matched_signals: string[];
  status: LeadStatus;
  notes: string | null;
  is_duplicate: boolean;
  duplicate_of_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface LeadPatch {
  status?: LeadStatus;
  notes?: string | null;
  service_category?: string;
}

export interface LeadPage {
  items: Lead[];
  total: number;
  page: number;
  page_size: number;
}

export interface LeadFilters {
  q?: string;
  status?: LeadStatus;
  category?: string;
  intent_label?: IntentLabel;
  min_relevance?: number;
  min_intent?: number;
  campaign_id?: number;
  run_id?: number;
  india_only?: boolean;
  include_duplicates?: boolean;
  include_not_leads?: boolean;
  sort_by?: SortableField;
  order?: 'asc' | 'desc';
}

export interface DashboardTotals {
  leads: number;
  duplicates_hidden: number;
  high_intent: number;
  shortlisted: number;
  needs_review: number;
  open_errors: number;
  pending_searches: number;
  runs: number;
}

export interface ReviewPrecisionData {
  overall: number | null;
  decided: number;
  by_intent_label: Record<
    string,
    {
      shortlisted: number;
      rejected: number;
      precision: number | null;
    }
  >;
}

export interface DashboardData {
  totals: DashboardTotals;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
  by_intent_label: Record<string, number>;
  leads_per_day: Array<{ date: string; count: number }>;
  review_precision: ReviewPrecisionData;
  recent_runs: ImportRun[];
}
