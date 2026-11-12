// ============================================================
// Jan Saathi AI — TypeScript Interfaces
// ============================================================

/* ───── Enums / Literals ───── */

export type Language =
  | 'en' | 'hi' | 'or' | 'bn' | 'ta' | 'te' | 'kn' | 'ml' | 'mr' | 'gu';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type CaseStatus =
  | 'submitted'
  | 'ai_processing'
  | 'awaiting_review'
  | 'under_review'
  | 'follow_up_requested'
  | 'treatment_planned'
  | 'completed'
  | 'closed';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type DoctorStatus = 'pending' | 'approved' | 'suspended';

export type NotificationType =
  | 'new_case'
  | 'priority_alert'
  | 'follow_up'
  | 'system';

/* ───── Patient / Case ───── */

export interface PersonalInfo {
  full_name: string;
  age: number;
  gender: Gender;
  contact_number: string;
  language: Language;
}

export interface ChiefComplaint {
  description: string;
  duration: string;
  severity: number; // 1-10
}

export interface MedicalHistory {
  past_conditions: string;
  allergies: string;
  current_medications: string;
}

export interface FollowUpAnswer {
  question: string;
  answer: string;
}

export interface CaseSubmission {
  personal_info: PersonalInfo;
  chief_complaint: ChiefComplaint;
  medical_history: MedicalHistory;
  follow_up_answers: FollowUpAnswer[];
  measurements?: any[];
}

export interface CaseSubmissionResponse {
  case_id: string;
  access_token: string;
  message: string;
}

export interface UploadedDocument {
  id: string;
  filename: string;
  file_type: string;
  uploaded_at: string;
  url: string;
}

export interface Measurement {
  name: string;
  value: number;
  unit: string;
  recorded_at: string;
  source: string;
}

export interface TriageResult {
  priority: Priority;
  reasoning: string;
  ai_confidence: number;
  suggested_specialties: string[];
  red_flags: string[];
  generated_at: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: string;
}

export interface CaseSummary {
  id?: string;
  case_id?: string;
  public_case_id: string;
  patient_name: string;
  patient_age?: number;
  patient_gender?: string;
  patient_contact?: string;
  preferred_language?: string;
  chief_complaint: string;
  complaint_duration?: string;
  severity?: string;
  status: string;
  priority: string;
  assigned_doctor_id?: string;
  latest_vitals?: Record<string, {
    value: number;
    unit: string;
    signal_quality?: string;
    source?: string;
  }>;
  created_at: string;
  updated_at?: string;
}

export interface CaseDetail {
  case_id: string;
  personal_info: PersonalInfo;
  chief_complaint: ChiefComplaint;
  medical_history: MedicalHistory;
  follow_up_answers: FollowUpAnswer[];
  documents: UploadedDocument[];
  measurements: Measurement[];
  triage: TriageResult | null;
  notes: DoctorNote[];
  treatment: TreatmentPlan | null;
  audit_log: AuditLogEntry[];
  status: CaseStatus;
  priority: Priority;
  assigned_doctor_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PatientCaseView {
  case_id: string;
  status: CaseStatus;
  priority: Priority;
  chief_complaint: string;
  doctor_response?: string;
  treatment?: TreatmentPlan;
  created_at: string;
  updated_at: string;
}

/* ───── Doctor ───── */

export interface DoctorNote {
  id: string;
  doctor_id: string;
  doctor_name: string;
  content: string;
  created_at: string;
}

export interface Medicine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface TreatmentPlan {
  id?: string;
  medicines?: Medicine[];
  advice?: string;
  follow_up_date?: string;
  finalized?: boolean;
  is_finalized?: boolean;
  finalized_at?: string;
  created_by?: string;
  assessment?: string;
  disposition?: string;
  next_steps?: string;
  follow_up_instructions?: string;
  warnings?: string;
  items?: any[];
}

export interface Doctor {
  id: string;
  full_name: string;
  email: string;
  registration_number: string;
  issuing_authority: string;
  phone: string;
  status: DoctorStatus;
  is_admin: boolean;
  created_at: string;
}

export interface DoctorLoginRequest {
  email: string;
  password: string;
}

export interface DoctorRegisterRequest {
  full_name: string;
  email: string;
  password: string;
  registration_number: string;
  issuing_authority: string;
  phone: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  doctor: Doctor;
}

export interface DashboardStats {
  total_cases: number;
  submitted: number;
  under_review: number;
  closed: number;
  emergency: number;
  urgent: number;
  elevated?: number;
  normal?: number;
  today_cases?: number;
  language_breakdown?: Record<string, number>;
  my_active_cases?: number;
  // Legacy aliases for backwards compatibility
  awaiting_review?: number;
  priority_alerts?: number;
  follow_ups?: number;
  completed_today?: number;
}

export interface NotificationCount {
  unread: number;
  emergencies: number;
}

export interface Notification {
  id: string;
  type?: NotificationType;
  notification_type?: string;
  title: string;
  message: string;
  case_id?: string;
  is_read?: boolean;
  acknowledged?: boolean;
  acknowledged_at?: string;
  created_at: string;
}

/* ───── Pagination ───── */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
  pages?: number;
}

export interface CaseFilters {
  status?: CaseStatus;
  priority?: Priority;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}

export interface OCRBiomarker {
  parameter: string;
  value: string;
  unit?: string;
  reference_range?: string;
  status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' | string;
}

export interface OCRExtractedData {
  document_type?: string;
  biomarkers?: OCRBiomarker[];
  medications?: string[];
  clinical_summary?: string;
}
