// Central domain models to prevent inline duplicates and keep entity shapes consistent.

export type Workspace = {
  id: string;
  name: string | null;
  owner_id: string | null;
  slug: string | null;
  brand_name: string | null;
  brand_tagline: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  public_lead_form_enabled?: boolean | null;
  auto_confirmation_email_enabled?: boolean | null;
};

export type Customer = {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at?: string | null;
};

export type Job = {
  id: string;
  user_id: string;
  workspace_id: string;
  customer_id?: string | null;
  title: string | null;
  description_raw: string | null;
  category: string | null;
  urgency: string | null;
  status: string | null;
  source: string | null;
  ai_category?: string | null;
  ai_urgency?: string | null;
  ai_confidence?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Quote = {
  id: string;
  job_id: string | null;
  workspace_id?: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
  updated_at: string | null;
  accepted_at?: string | null;
  paid_at?: string | null;
  public_token?: string | null;
};

export type Invoice = {
  id: string;
  job_id: string | null;
  workspace_id?: string | null;
  quote_id: string;
  invoice_number: number | null;
  status: string | null;
  total: number | null;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  public_token: string | null;
  customer_email: string | null;
};

export type Appointment = {
  id: string;
  job_id: string | null;
  workspace_id?: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  location: string | null;
};

export type Message = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  customer_id: string | null;
  direction: string | null;
  channel: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_at: string | null;
  sent_at?: string | null;
};

export type Call = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  customer_id: string | null;
  user_id: string | null;
  twilio_call_sid?: string | null;
  recording_url?: string | null;
  duration_seconds?: number | null;
  status: string | null;
  summary: string | null;
  ai_summary?: string | null;
  transcript?: string | null;
  direction: string | null;
  from_number?: string | null;
  to_number?: string | null;
  priority?: string | null;
  needs_followup?: boolean | null;
  attention_score?: number | null;
  attention_reason?: string | null;
  created_at?: string | null;
};

export type Media = {
  id: string;
  workspace_id: string;
  user_id: string;
  job_id: string;
  bucket_id: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  url: string | null;
  caption: string | null;
  kind: string | null;
  created_at: string | null;
  quote_id?: string | null;
  invoice_id?: string | null;
  is_public?: boolean | null;
};

export type AutomationSettings = {
  workspace_id: string;
  notify_urgent_leads: boolean;
  show_overdue_work: boolean;
};
