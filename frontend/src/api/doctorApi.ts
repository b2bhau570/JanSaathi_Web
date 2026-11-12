import client from './client';
import type {
  AuthResponse,
  CaseDetail,
  CaseSummary,
  CaseFilters,
  DashboardStats,
  DoctorLoginRequest,
  DoctorRegisterRequest,
  DoctorNote,
  Medicine,
  TreatmentPlan,
  Notification,
  Doctor,
  PaginatedResponse,
  NotificationCount,
} from '../types';

/* ───── Auth ───── */

export async function loginDoctor(data: DoctorLoginRequest): Promise<AuthResponse> {
  const tokenRes = await client.post<{ access_token: string; token_type: string }>('/auth/doctor/login', data);
  const token = tokenRes.data.access_token;
  localStorage.setItem('doctor_token', token);
  const profileRes = await client.get<Doctor>('/auth/doctor/me');
  return {
    access_token: token,
    token_type: 'bearer',
    doctor: profileRes.data,
  };
}

export async function registerDoctor(data: DoctorRegisterRequest): Promise<{ message: string }> {
  await client.post('/auth/doctor/register', data);
  return { message: 'Registration submitted. Account pending approval.' };
}

/* ───── Dashboard ───── */

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await client.get<DashboardStats>('/doctor/dashboard/stats');
  return res.data;
}

export async function getRecentCases(): Promise<CaseSummary[]> {
  const res = await client.get<CaseSummary[]>('/doctor/dashboard/recent-cases');
  return res.data;
}

/* ───── Cases ───── */

export async function getCases(filters: CaseFilters): Promise<PaginatedResponse<CaseSummary>> {
  const res = await client.get<PaginatedResponse<CaseSummary>>('/doctor/cases', {
    params: filters,
  });
  return res.data;
}

export async function getCaseDetail(caseId: string): Promise<CaseDetail> {
  const res = await client.get<CaseDetail>(`/doctor/cases/${caseId}`);
  return res.data;
}

export async function updateCaseStatus(
  caseId: string,
  status: string,
): Promise<void> {
  await client.patch(`/doctor/cases/${caseId}/status`, { status });
}

export async function assignCase(caseId: string): Promise<any> {
  const res = await client.post(`/doctor/cases/${caseId}/assign`);
  return res.data;
}

export async function recordVitals(caseId: string, vitals: Record<string, any>): Promise<any> {
  const res = await client.post(`/doctor/cases/${caseId}/measurements`, vitals);
  return res.data;
}

/* ───── Notes ───── */

export async function addNote(
  caseId: string,
  content: string,
): Promise<DoctorNote> {
  const res = await client.post<DoctorNote>(`/doctor/cases/${caseId}/notes`, {
    content,
  });
  return res.data;
}

/* ───── Treatment ───── */

export async function saveTreatment(
  caseId: string,
  medicines: Medicine[],
  advice: string,
  followUpDate?: string,
): Promise<TreatmentPlan> {
  const res = await client.post<TreatmentPlan>(
    `/doctor/cases/${caseId}/treatment`,
    { medicines, advice, follow_up_date: followUpDate },
  );
  return res.data;
}

export async function finalizeTreatment(caseId: string): Promise<any> {
  const res = await client.post(`/doctor/cases/${caseId}/treatment/finalize`);
  return res.data;
}

/* ───── Notifications ───── */

export async function getNotifications(): Promise<Notification[]> {
  const res = await client.get<Notification[]>('/doctor/notifications');
  return res.data;
}

export async function getUnreadNotificationCount(): Promise<NotificationCount> {
  const res = await client.get<NotificationCount>('/doctor/notifications/unread-count');
  return res.data;
}

export async function acknowledgeNotification(id: string): Promise<void> {
  await client.post(`/doctor/notifications/${id}/acknowledge`);
}

/* ───── Profile ───── */

export async function getDoctorProfile(): Promise<Doctor> {
  const res = await client.get<Doctor>('/doctor/profile');
  return res.data;
}

export async function updateDoctorProfile(
  data: Partial<Pick<Doctor, 'full_name' | 'phone'>>,
): Promise<Doctor> {
  const res = await client.patch<Doctor>('/doctor/profile', data);
  return res.data;
}

/* ───── Documents (In-Browser Prescription & Report Viewing) ───── */

export async function getDoctorDocumentBlob(caseId: string, docId: string): Promise<Blob> {
  const res = await client.get(`/doctor/cases/${caseId}/documents/${docId}/download`, {
    responseType: 'blob',
  });
  return res.data;
}

export async function overrideTriagePriority(
  caseId: string,
  priority: 'normal' | 'elevated' | 'urgent' | 'emergency',
  reason: string
): Promise<any> {
  const res = await client.post(`/doctor/cases/${caseId}/override-triage`, {
    priority,
    reason,
  });
  return res.data;
}

export async function downloadReferralPdf(caseId: string): Promise<Blob> {
  const res = await client.get(`/doctor/cases/${caseId}/referral-pdf`, {
    responseType: 'blob',
  });
  return res.data;
}
