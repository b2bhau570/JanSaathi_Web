import client from './client';
import type {
  CaseSubmission,
  CaseSubmissionResponse,
  PatientCaseView,
} from '../types';

export async function submitCase(data: CaseSubmission): Promise<CaseSubmissionResponse> {
  const res = await client.post<CaseSubmissionResponse>('/patient/cases', data);
  return res.data;
}

export async function checkCase(
  caseId: string,
  accessToken: string,
): Promise<PatientCaseView> {
  const res = await client.get<PatientCaseView>(`/patient/cases/${caseId}`, {
    headers: { 'X-Access-Token': accessToken },
  });
  return res.data;
}

export async function uploadDocument(
  caseId: string,
  accessToken: string,
  file: File,
): Promise<{ id: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post(`/patient/cases/${caseId}/documents`, formData, {
    headers: {
      'X-Access-Token': accessToken,
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
}

export async function getReceipt(
  caseId: string,
  accessToken: string,
): Promise<Blob> {
  const res = await client.get(`/patient/cases/${caseId}/receipt`, {
    headers: { 'X-Access-Token': accessToken },
    responseType: 'blob',
  });
  return res.data;
}

export async function getFollowUpQuestions(
  chiefComplaint: string,
  language: string,
  existingAnswers?: Record<string, string>,
): Promise<{ questions: string[]; detected_symptoms?: string[]; disclaimer?: string }> {
  const res = await client.post('/patient/follow-up-questions', {
    chief_complaint: chiefComplaint,
    language,
    existing_answers: existingAnswers,
  });
  return res.data;
}

export interface TTSResponse {
  status: string;
  provider: string;
  model?: string;
  language?: string;
  speaker?: string;
  audio?: string;
  format?: string;
  message?: string;
}

export async function synthesizeSpeech(
  text: string,
  language: string,
  apiKey?: string,
  speaker?: string,
  provider?: 'sarvam' | 'elevenlabs',
  elevenlabsKey?: string,
  elevenlabsVoiceId?: string,
): Promise<TTSResponse> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Sarvam-Key'] = apiKey;
  if (elevenlabsKey) headers['X-ElevenLabs-Key'] = elevenlabsKey;
  const res = await client.post<TTSResponse>(
    '/patient/tts',
    {
      text,
      language,
      api_key: apiKey,
      speaker,
      provider,
      elevenlabs_api_key: elevenlabsKey,
      elevenlabs_voice_id: elevenlabsVoiceId,
    },
    { headers, timeout: 30000 },
  );
  return res.data;
}

export async function getTTSStatus(
  apiKey?: string,
  elevenlabsKey?: string,
): Promise<{
  sarvam_configured: boolean;
  elevenlabs_configured: boolean;
  model: string;
  default_speaker?: string;
  elevenlabs_voice_id?: string;
}> {
  const headers: Record<string, string> = {};
  if (apiKey) headers['X-Sarvam-Key'] = apiKey;
  if (elevenlabsKey) headers['X-ElevenLabs-Key'] = elevenlabsKey;
  const res = await client.get('/patient/tts/status', { headers });
  return res.data;
}

export async function saveSarvamKey(
  apiKey: string,
): Promise<{ status: string; message: string }> {
  const res = await client.post<{ status: string; message: string }>('/patient/tts/key', {
    api_key: apiKey,
  });
  return res.data;
}

export async function saveElevenLabsKey(
  apiKey: string,
  voiceId?: string,
): Promise<{ status: string; message: string; characters_used?: number; character_limit?: number; voice_id?: string }> {
  const res = await client.post<{ status: string; message: string; characters_used?: number; character_limit?: number; voice_id?: string }>(
    '/patient/tts/elevenlabs-key',
    {
      api_key: apiKey,
      voice_id: voiceId,
    },
  );
  return res.data;
}

export interface STTResponse {
  status: 'success' | 'fallback' | 'empty' | 'error';
  provider: string;
  transcript: string;
  language_code?: string;
  message?: string;
}

export async function transcribeSpeech(
  audioBlob: Blob,
  language: string,
): Promise<STTResponse> {
  const formData = new FormData();
  const filename = audioBlob.type.includes('wav') ? 'speech.wav' : 'recording.webm';
  formData.append('file', audioBlob, filename);
  formData.append('language', language);
  const res = await client.post<STTResponse>('/patient/stt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export interface VoiceIntakeResponse {
  status: 'success' | 'fallback' | 'empty' | 'inaudible' | 'error';
  provider: string;
  is_valid?: boolean;
  needs_clarification?: boolean;
  is_answered?: boolean;
  name?: string;
  age?: number | '' | null;
  gender?: string | null;
  contact?: string | null;
  whatsapp_number?: string | null;
  complaint?: string;
  medical_history?: string;
  medications?: string;
  allergies?: string;
  duration?: string;
  severity?: string;
  updated_name?: string | null;
  updated_age?: number | '' | null;
  updated_gender?: string | null;
  updated_contact?: string | null;
  updated_complaint?: string | null;
  is_field_update?: boolean;
  updated_field?: string | null;
  reply: string;
  questions?: string[];
  has_complaint?: boolean;
  next_step: number;
  is_clarification_or_repeat?: boolean;
  repeat_current_question?: boolean;
  is_finished?: boolean;
  extracted_answer?: string;
  next_question?: string;
  action?: 'proceed_to_vitals' | 'proceed_to_confirmation' | 'submit' | 'continue_conversation';
  patient_question_answered?: boolean;
  is_reports_complete?: boolean;
}

export async function analyzeVoiceIntake(payload: {
  transcript: string;
  step: number;
  language: string;
  patient_name?: string;
  patient_age?: number | '';
  patient_gender?: string;
  patient_contact?: string;
  chief_complaint?: string;
  current_question?: string;
  question_index?: number;
  total_questions_target?: number;
  existing_answers?: Record<string, string> | Array<{ question: string; answer: string }>;
  conversation_history?: Array<{ sender: string; text: string }>;
  uploaded_reports_count?: number;
  uploaded_filenames?: string[];
  current_slot?: string;
}): Promise<VoiceIntakeResponse> {
  const res = await client.post<VoiceIntakeResponse>('/patient/ai-voice-intake', payload);
  return res.data;
}

/* ── Medicine Ordering ── */

export async function getCaseOrderDetails(caseId: string, token: string): Promise<any> {
  const res = await client.get(`/patient/cases/${caseId}/order-details`, {
    headers: { 'X-Case-Access-Token': token },
    params: { token },
  });
  return res.data;
}

export async function placeCaseMedicineOrder(caseId: string, token: string, payload: {
  delivery_type: string;
  delivery_address: string;
  contact_number: string;
  payment_method: string;
}): Promise<any> {
  const res = await client.post(`/patient/cases/${caseId}/order-medicines`, payload, {
    headers: { 'X-Case-Access-Token': token },
    params: { token },
  });
  return res.data;
}

/* ── WhatsApp AI Bot & Doubts Assistant ── */

export interface WhatsAppChatMessage {
  id: string;
  sender: 'bot' | 'patient';
  text: string;
  status: string;
  timestamp: string | null;
}

export interface WhatsAppChatHistoryResponse {
  public_case_id: string;
  patient_name: string;
  patient_contact: string;
  preferred_language: string;
  diagnosis: string;
  order_url: string;
  messages: WhatsAppChatMessage[];
}

export interface WhatsAppChatSendResponse {
  status: string;
  incoming_message_id?: string;
  reply: string;
  bot_message_id?: string;
  case_id?: string;
  patient_name?: string;
  phone_number?: string;
  timestamp: string;
}

export async function getWhatsAppChatHistory(
  caseId: string,
  token?: string,
): Promise<WhatsAppChatHistoryResponse> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['X-Case-Access-Token'] = token;
  }
  const res = await client.get<WhatsAppChatHistoryResponse>(
    `/patient/whatsapp/chat/${caseId}`,
    {
      headers,
      params: token ? { token } : undefined,
    },
  );
  return res.data;
}

export interface OCRBiomarker {
  parameter: string;
  value: string;
  unit?: string;
  reference_range?: string;
  status: 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL' | string;
}

export interface OCRExtractedData {
  status?: string;
  filename?: string;
  document_type: string;
  biomarkers: OCRBiomarker[];
  medications: string[];
  clinical_summary: string;
  ocr_status?: string;
}

export async function ocrDocument(file: File): Promise<OCRExtractedData> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await client.post<OCRExtractedData>('/patient/ocr-document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 45000,
  });
  return res.data;
}

export async function sendWhatsAppChatMessage(payload: {
  public_case_id: string;
  phone_number?: string;
  message: string;
  token?: string;
}): Promise<WhatsAppChatSendResponse> {
  const headers: Record<string, string> = {};
  if (payload.token) {
    headers['X-Case-Access-Token'] = payload.token;
  }
  const res = await client.post<WhatsAppChatSendResponse>(
    '/patient/whatsapp/chat',
    payload,
    { headers, timeout: 30000 },
  );
  return res.data;
}
