import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCaseDetail,
  updateCaseStatus,
  finalizeTreatment,
  assignCase,
  getDoctorDocumentBlob,
  overrideTriagePriority,
  downloadReferralPdf,
} from '../../api/doctorApi';
import type { OCRExtractedData } from '../../types';
import client from '../../api/client';
import { useAuth } from '../../contexts/useAuth';
import { Esp32HardwareMonitor } from '../../components/hardware/Esp32HardwareMonitor';
import { INITIAL_MEDICINE_CATALOG } from '../../data/medicineCatalog';

const CLINICAL_PRESETS = [
  {
    id: 'urti',
    label: 'Acute Upper Respiratory (Viral URTI)',
    diagnosis: 'Acute upper respiratory tract viral infection / rhinopharyngitis',
    advice: 'Steam inhalation twice daily, warm saline gargles, plenty of lukewarm fluids, and rest. Avoid chilled beverages.',
    followUp: 'Return in 3 days if fever persists beyond 101°F or if cough worsens.',
    redFlags: 'Seek immediate emergency attention if breathing difficulty, chest pain, or hemoptysis develops.',
    medicines: [
      { medicine_name: 'Paracetamol', strength: '500mg', dosage: '1 tablet', route: 'oral', frequency: 'TDS (thrice daily)', duration: '3 days', instructions: 'Take after meals for fever/body ache' },
      { medicine_name: 'Cetirizine', strength: '10mg', dosage: '1 tablet', route: 'oral', frequency: 'OD (once daily bedtime)', duration: '5 days', instructions: 'Take at night' },
      { medicine_name: 'Cough Lozenges / Syrup', strength: '10ml', dosage: '2 tsp', route: 'oral', frequency: 'TDS', duration: '5 days', instructions: 'Sip slowly for soothing throat' },
    ],
  },
  {
    id: 'ge',
    label: 'Acute Gastroenteritis & Dehydration',
    diagnosis: 'Acute acute watery gastroenteritis with mild dehydration',
    advice: 'Consume strictly boiled/filtered water, light khichdi, curd, banana, and tender coconut water. Avoid dairy milk and spicy foods.',
    followUp: 'Follow up in 48 hours or sooner if diarrhea frequency increases.',
    redFlags: 'Extreme weakness, inability to retain oral fluids, sunken eyes, or blood in stool.',
    medicines: [
      { medicine_name: 'Oral Rehydration Salts (ORS)', strength: '1 packet', dosage: 'In 1L water', route: 'oral', frequency: 'Sip after each loose stool', duration: '3 days', instructions: 'Consume within 24 hrs of mixing' },
      { medicine_name: 'Zinc Sulfate', strength: '20mg', dosage: '1 tablet', route: 'oral', frequency: 'OD (once daily)', duration: '14 days', instructions: 'Continue full 14-day course' },
      { medicine_name: 'Ondansetron', strength: '4mg', dosage: '1 tablet', route: 'oral', frequency: 'SOS (if nausea/vomiting)', duration: '2 days', instructions: 'Take 30 mins before food' },
      { medicine_name: 'Lactobacillus Probiotic', strength: '1 cap', dosage: '1 capsule', route: 'oral', frequency: 'BD (twice daily)', duration: '5 days', instructions: 'Take with room-temperature water' },
    ],
  },
  {
    id: 'msk',
    label: 'Musculoskeletal Pain / Sprain',
    diagnosis: 'Acute mechanical muscle strain / soft tissue sprain',
    advice: 'Relative rest for 48 hours, avoid lifting heavy objects or forward bending. Apply warm compress after 48 hours.',
    followUp: 'Return in 5 days if pain does not improve.',
    redFlags: 'Severe numbness or tingling in limbs, radiating pain below knee, or loss of bowel/bladder control.',
    medicines: [
      { medicine_name: 'Paracetamol + Aceclofenac', strength: '325mg/100mg', dosage: '1 tablet', route: 'oral', frequency: 'BD after food', duration: '5 days', instructions: 'Do not take on empty stomach' },
      { medicine_name: 'Pantoprazole', strength: '40mg', dosage: '1 tablet', route: 'oral', frequency: 'OD morning', duration: '5 days', instructions: 'Take 30 mins before breakfast' },
      { medicine_name: 'Diclofenac Gel', strength: '1%', dosage: 'Pea-sized', route: 'topical', frequency: 'TDS gentle application', duration: '5 days', instructions: 'Apply without vigorous rubbing' },
    ],
  },
  {
    id: 'htn',
    label: 'Essential Hypertension (Routine OPD)',
    diagnosis: 'Stage 1 Essential Hypertension under routine OPD monitoring',
    advice: 'Restrict dietary sodium (< 5g salt/day), brisk walking 30 mins daily, avoid fried/processed snacks. Maintain daily home BP log.',
    followUp: 'Review BP reading in 2 weeks with recorded log.',
    redFlags: 'Sudden severe headache, visual blurring, acute chest discomfort, or shortness of breath.',
    medicines: [
      { medicine_name: 'Amlodipine', strength: '5mg', dosage: '1 tablet', route: 'oral', frequency: 'OD (morning)', duration: '30 days', instructions: 'Take consistently at same time' },
    ],
  },
];

interface DocumentPhotoViewerProps {
  doc: any;
  caseId: string;
}

function parseDocOcrData(raw?: string | null): OCRExtractedData | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as OCRExtractedData;
    }
  } catch {
    return null;
  }
  return null;
}

function getBiomarkerBadgeClass(status?: string): string {
  const s = (status || 'NORMAL').toUpperCase();
  if (s === 'CRITICAL') return 'bg-red-600 text-white border-red-700';
  if (s === 'HIGH') return 'bg-amber-500/20 text-amber-900 border-amber-500/40';
  if (s === 'LOW') return 'bg-sky-500/20 text-sky-900 border-sky-500/40';
  return 'bg-emerald-500/15 text-emerald-900 border-emerald-500/30';
}

const DocumentOcrVerificationCard: React.FC<{ doc: any; caseId: string }> = ({ doc, caseId }) => {
  const ocr = parseDocOcrData(doc.extracted_data);
  const biomarkers = Array.isArray(ocr?.biomarkers) ? ocr.biomarkers : [];
  const medications = Array.isArray(ocr?.medications) ? ocr.medications : [];
  const abnormalCount = biomarkers.filter((b) => (b.status || 'NORMAL').toUpperCase() !== 'NORMAL').length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 bg-cream/60 border border-ink/10 rounded-2xl p-3">
      <DocumentPhotoViewer doc={doc} caseId={caseId} />

      <div className="border border-ink/12 rounded-2xl bg-cream p-4 flex flex-col justify-between space-y-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 pb-2.5">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-magenta block">
                Multimodal Gemini Vision OCR
              </span>
              <h4 className="font-serif opsz-72 text-sm font-semibold text-ink">
                {ocr?.document_type || 'Clinical Document Extraction'}
              </h4>
            </div>
            <div className="flex items-center gap-1.5">
              {abnormalCount > 0 && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-magenta text-cream">
                  {abnormalCount} Abnormal Flag{abnormalCount > 1 ? 's' : ''}
                </span>
              )}
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-creamdeep border border-ink/12 text-inkmute">
                {ocr ? `${biomarkers.length} Biomarkers` : 'Unparsed'}
              </span>
            </div>
          </div>

          {!ocr ? (
            <div className="py-8 text-center text-xs text-inkmute space-y-1.5 bg-creamdeep/60 rounded-xl border border-dashed border-ink/15 px-4">
              <iconify-icon icon="ph:scan-bold" width="24" height="24" className="mx-auto block text-ink/40"></iconify-icon>
              <p className="font-medium text-ink">No structured OCR biomarkers saved for this document.</p>
              <p className="text-[11px]">Verify handwritten prescription or scan visually in the left panel.</p>
            </div>
          ) : (
            <>
              {ocr.clinical_summary && (
                <div className="bg-creamdeep border border-ink/10 rounded-xl p-3 text-xs text-ink leading-relaxed">
                  <strong className="text-[10px] uppercase tracking-wider text-inkmute block mb-1">
                    AI Objective Summary (Non-Diagnostic)
                  </strong>
                  {ocr.clinical_summary}
                </div>
              )}

              {biomarkers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-inkmute">
                    Extracted Lab Biomarkers
                  </p>
                  <div className="overflow-x-auto border border-ink/10 rounded-xl">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-creamdeep border-b border-ink/10 text-inkmute">
                          <th className="py-1.5 px-2.5 font-semibold">Parameter</th>
                          <th className="py-1.5 px-2.5 font-semibold">Value</th>
                          <th className="py-1.5 px-2.5 font-semibold">Ref Range</th>
                          <th className="py-1.5 px-2.5 font-semibold text-right">Flag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/8">
                        {biomarkers.map((bm, i) => {
                          const isAbnormal = (bm.status || 'NORMAL').toUpperCase() !== 'NORMAL';
                          return (
                            <tr key={i} className={isAbnormal ? 'bg-magenta/5 font-semibold' : ''}>
                              <td className="py-1.5 px-2.5 text-ink">{bm.parameter}</td>
                              <td className="py-1.5 px-2.5 font-mono text-ink">
                                {bm.value} {bm.unit || ''}
                              </td>
                              <td className="py-1.5 px-2.5 text-inkmute">{bm.reference_range || '—'}</td>
                              <td className="py-1.5 px-2.5 text-right">
                                <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${getBiomarkerBadgeClass(bm.status)}`}>
                                  {(bm.status || 'NORMAL').toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {medications.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-inkmute">
                    Extracted Medications & Dosages
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {medications.map((med, i) => (
                      <span
                        key={i}
                        className="text-[11px] bg-creamdeep border border-ink/12 rounded-lg px-2.5 py-1 text-ink font-medium"
                      >
                        {med}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-[10px] text-inkmute border-t border-ink/8 pt-2">
          Verify every AI-extracted figure directly against the original scanned document on the left before clinical action.
        </p>
      </div>
    </div>
  );
};

export const DocumentPhotoViewer: React.FC<DocumentPhotoViewerProps> = ({ doc, caseId }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isImage = doc.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(doc.original_filename);
  const isPdf = doc.file_type === 'application/pdf' || /\.pdf$/i.test(doc.original_filename);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    const loadDoc = async () => {
      try {
        setLoading(true);
        setError(null);
        const blob = await getDoctorDocumentBlob(caseId, doc.id);
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (err: any) {
        if (!active) return;
        console.warn('Direct blob load issue, falling back to direct token url:', err);
        const token = localStorage.getItem('doctor_token') || '';
        setBlobUrl(`/api/v1/doctor/cases/${caseId}/documents/${doc.id}/view?token=${token}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadDoc();
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [caseId, doc.id]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.75));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setHighContrast(false);
  };
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className="border border-ink/10 rounded-2xl bg-cream overflow-hidden shadow-xs space-y-2">
      {/* Top Header Bar */}
      <div className="p-3 bg-creamdeep border-b border-ink/8 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-magenta/10 text-magenta flex items-center justify-center shrink-0">
            <iconify-icon icon={isImage ? "ph:image-fill" : isPdf ? "ph:file-pdf-fill" : "ph:file-text-fill"} width="16" height="16"></iconify-icon>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink truncate text-xs" title={doc.original_filename}>
              {doc.original_filename}
            </p>
            <span className="text-[10px] text-inkmute block">
              {(doc.file_size / 1024).toFixed(1)} KB • {isImage ? 'Prescription / Lab Photo' : doc.file_type}
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isImage && (
            <>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg border border-ink/10 bg-cream text-ink hover:border-magenta hover:text-magenta transition-colors"
                title="Zoom In"
              >
                <iconify-icon icon="ph:magnifying-glass-plus-bold" width="14" height="14"></iconify-icon>
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg border border-ink/10 bg-cream text-ink hover:border-magenta hover:text-magenta transition-colors"
                title="Zoom Out"
              >
                <iconify-icon icon="ph:magnifying-glass-minus-bold" width="14" height="14"></iconify-icon>
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="p-1.5 rounded-lg border border-ink/10 bg-cream text-ink hover:border-magenta hover:text-magenta transition-colors"
                title="Rotate 90° Clockwise"
              >
                <iconify-icon icon="ph:arrow-clockwise-bold" width="14" height="14"></iconify-icon>
              </button>
              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                  highContrast
                    ? 'bg-magenta text-cream border-magenta shadow-xs'
                    : 'border-ink/10 bg-cream text-ink hover:border-magenta'
                }`}
                title="Enhance faint doctor handwriting ink contrast"
              >
                <iconify-icon icon="ph:eye-bold" width="12" height="12"></iconify-icon>
                <span>Ink Enhance</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="p-1.5 rounded-lg border border-ink/10 bg-cream text-inkmute hover:text-ink text-[11px]"
                title="Reset Zoom & Rotation"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="pill pill-ink px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1"
                title="Fullscreen Examination"
              >
                <iconify-icon icon="ph:arrows-out-bold" width="12" height="12"></iconify-icon>
                <span>Fullscreen</span>
              </button>
            </>
          )}

          <a
            href={blobUrl || `/api/v1/doctor/cases/${caseId}/documents/${doc.id}/download`}
            download={doc.original_filename}
            target="_blank"
            rel="noreferrer"
            className="pill pill-secondary px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1"
            title="Download original file"
          >
            <iconify-icon icon="ph:download-simple-bold" width="12" height="12"></iconify-icon>
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* Main Preview Canvas */}
      <div className="relative bg-ink/5 min-h-[260px] max-h-[460px] overflow-auto flex items-center justify-center p-3 rounded-b-xl">
        {loading ? (
          <div className="flex flex-col items-center gap-2 text-inkmute text-xs py-10">
            <iconify-icon icon="line-md:loading-loop" width="24" height="24" className="text-magenta"></iconify-icon>
            <span>Loading prescription photo...</span>
          </div>
        ) : error ? (
          <div className="text-center text-xs text-red-600 py-8">
            <p>{error}</p>
          </div>
        ) : isImage && blobUrl ? (
          <div
            className="relative cursor-zoom-in transition-transform duration-150 inline-block"
            onClick={() => setIsFullscreen(true)}
            title="Click to view Fullscreen Lightbox"
          >
            <img
              src={blobUrl}
              alt={doc.original_filename}
              className="max-w-full rounded-lg shadow-md transition-all object-contain"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                filter: highContrast ? 'contrast(165%) brightness(105%) saturate(130%) drop-shadow(0 0 1px #000)' : 'none',
                maxHeight: '420px',
              }}
            />
          </div>
        ) : isPdf && blobUrl ? (
          <iframe
            src={blobUrl}
            title={doc.original_filename}
            className="w-full h-[400px] rounded-lg border border-ink/10 bg-white"
          />
        ) : (
          <div className="text-center text-xs text-inkmute py-8">
            <p>Preview not supported for this file format. Please use Download.</p>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && blobUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 md:p-6"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="flex items-center justify-between text-cream pb-3 border-b border-cream/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{doc.original_filename}</span>
              <span className="text-xs text-cream/60">(Doctor Handwriting Examination Mode)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomIn}
                className="pill pill-secondary text-cream border-cream/30 px-3 py-1 text-xs"
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="pill pill-secondary text-cream border-cream/30 px-3 py-1 text-xs"
              >
                Zoom -
              </button>
              <button
                type="button"
                onClick={handleRotate}
                className="pill pill-secondary text-cream border-cream/30 px-3 py-1 text-xs"
              >
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                className={`pill px-3 py-1 text-xs font-semibold ${
                  highContrast ? 'bg-magenta text-cream' : 'pill-secondary text-cream border-cream/30'
                }`}
              >
                {highContrast ? '✓ Ink Enhance ON' : 'Ink Enhance'}
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 rounded-full bg-cream/20 text-cream hover:bg-cream/30 text-xs"
                title="Close Lightbox"
              >
                <iconify-icon icon="ph:x-bold" width="16" height="16"></iconify-icon>
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-auto flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={blobUrl}
              alt={doc.original_filename}
              className="max-w-none transition-all shadow-2xl rounded-lg"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                filter: highContrast ? 'contrast(175%) brightness(105%) saturate(135%) drop-shadow(0 0 2px #000)' : 'none',
                maxHeight: zoom <= 1 ? '85vh' : 'none',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const CaseDetailPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { doctor } = useAuth();
  const [isClaiming, setIsClaiming] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'info' | 'complaint' | 'documents' | 'measurements' | 'triage' | 'notes' | 'treatment'
  >('info');

  const [caseData, setCaseData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Doctor note form
  const [noteType, setNoteType] = useState('assessment');
  const [noteContent, setNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Treatment record form
  const [treatmentAssessment, setTreatmentAssessment] = useState('');
  const [treatmentDisposition, setTreatmentDisposition] = useState('Outpatient Management');
  const [treatmentNextSteps, setTreatmentNextSteps] = useState('');
  const [treatmentFollowUp, setTreatmentFollowUp] = useState('');
  const [treatmentWarnings, setTreatmentWarnings] = useState('');
  const [finalizedWhatsAppModal, setFinalizedWhatsAppModal] = useState<any | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [showPrescriptionRef, setShowPrescriptionRef] = useState(true);
  const [medicines, setMedicines] = useState<any[]>([
    {
      medicine_name: '',
      strength: '',
      dosage: '',
      route: 'oral',
      frequency: 'TDS (thrice daily)',
      duration: '5 days',
      instructions: 'Take after meals',
    },
  ]);
  const [isSavingTreatment, setIsSavingTreatment] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Medical Shop Picker Modal state
  const [showShopModal, setShowShopModal] = useState(false);
  const [shopSearch, setShopSearch] = useState('');
  const [shopCategory, setShopCategory] = useState('All');
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Measurement simulator

  // PDF report download & referral slip
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingReferral, setIsDownloadingReferral] = useState(false);

  // Clinician triage tier override
  const [overridePriority, setOverridePriority] = useState<string>('normal');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverridingTriage, setIsOverridingTriage] = useState(false);
  const [triageOverrideMessage, setTriageOverrideMessage] = useState<string | null>(null);

  const loadCase = React.useCallback(async () => {
    if (!caseId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCaseDetail(caseId);
      setCaseData(data);
      setOverridePriority(data.priority || 'normal');

      if (data.treatment) {
        setTreatmentAssessment(data.treatment.assessment || '');
        setTreatmentDisposition(data.treatment.disposition || 'Outpatient Management');
        setTreatmentNextSteps(data.treatment.next_steps || '');
        setTreatmentFollowUp(data.treatment.follow_up_instructions || '');
        setTreatmentWarnings(data.treatment.warnings || '');
        if (data.treatment.items && data.treatment.items.length > 0) {
          setMedicines(data.treatment.items);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Could not load case details.');
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadCase();
    });
    return () => {
      active = false;
    };
  }, [loadCase]);

  const handleStatusChange = async (newStatus: string) => {
    if (!caseId) return;
    setUpdatingStatus(true);
    try {
      await updateCaseStatus(caseId, newStatus);
      await loadCase();
    } catch (err) {
      console.error(err);
      alert('Failed to update case status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !noteContent.trim()) return;
    setIsAddingNote(true);
    try {
      await client.post(`/doctor/cases/${caseId}/notes`, {
        note_type: noteType,
        content: noteContent.trim(),
      });
      setNoteContent('');
      await loadCase();
    } catch (err) {
      console.error(err);
      alert('Failed to add note.');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleSaveTreatment = async () => {
    if (!caseId) return;
    setIsSavingTreatment(true);
    try {
      const cleanMedicines = medicines.filter((m) => m.medicine_name.trim().length > 0);
      await client.post(`/doctor/cases/${caseId}/treatment`, {
        assessment: treatmentAssessment,
        disposition: treatmentDisposition,
        next_steps: treatmentNextSteps,
        follow_up_instructions: treatmentFollowUp,
        warnings: treatmentWarnings,
        items: cleanMedicines,
      });
      alert('Treatment plan draft saved.');
      await loadCase();
    } catch (err) {
      console.error(err);
      alert('Failed to save treatment record.');
    } finally {
      setIsSavingTreatment(false);
    }
  };

  const handleFinalizeTreatment = async () => {
    if (!caseId) return;
    if (!confirm('Finalizing will generate the AI patient summary, dispatch the WhatsApp SMS, and unlock subsidized Jan Aushadhi medicine ordering. Proceed?')) {
      return;
    }
    setIsFinalizing(true);
    try {
      const cleanMedicines = medicines.filter((m) => m.medicine_name.trim().length > 0);
      await client.post(`/doctor/cases/${caseId}/treatment`, {
        assessment: treatmentAssessment,
        disposition: treatmentDisposition,
        next_steps: treatmentNextSteps,
        follow_up_instructions: treatmentFollowUp,
        warnings: treatmentWarnings,
        items: cleanMedicines,
      });
      const res = await finalizeTreatment(caseId);
      setFinalizedWhatsAppModal(res);
      await loadCase();
    } catch (err) {
      console.error(err);
      alert('Failed to finalize treatment.');
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleDownloadFullReport = async () => {
    if (!caseId) return;
    setIsDownloadingPdf(true);
    try {
      const res = await client.get(`/doctor/cases/${caseId}/report`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanSaathi-ClinicalReport-${caseData?.public_case_id || caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF report.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadReferralPdf = async () => {
    if (!caseId) return;
    setIsDownloadingReferral(true);
    try {
      const blob = await downloadReferralPdf(caseId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanSaathi-108-Referral-${caseData?.public_case_id || caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert('Failed to download 108 Referral Slip PDF.');
    } finally {
      setIsDownloadingReferral(false);
    }
  };

  const handleTriageOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    const trimmedReason = overrideReason.trim();
    if (trimmedReason.length < 5) {
      alert('Please enter a clinical reason (at least 5 characters) for overriding triage priority.');
      return;
    }
    setIsOverridingTriage(true);
    setTriageOverrideMessage(null);
    try {
      const targetTier = overridePriority as 'normal' | 'elevated' | 'urgent' | 'emergency';
      const res = await overrideTriagePriority(caseId, targetTier, trimmedReason);
      setOverrideReason('');
      setTriageOverrideMessage(
        `Triage priority updated from ${String(res.old_priority || caseData?.priority || '').toUpperCase()} to ${String(res.new_priority || targetTier).toUpperCase()} and recorded in AuditLog.`
      );
      await loadCase();
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to override triage priority.');
    } finally {
      setIsOverridingTriage(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-inkmute space-y-3">
        <div className="animate-spin w-8 h-8 border-3 border-magenta border-t-transparent rounded-full mx-auto" />
        <p className="text-sm">Loading clinical case record...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="bg-creamdeep p-8 rounded-2xl border border-magenta/25 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-magenta/15 text-magenta flex items-center justify-center mx-auto">
          <iconify-icon icon="ph:warning-circle-fill" width="24" height="24"></iconify-icon>
        </div>
        <h2 className="font-serif opsz-72 text-base font-semibold text-ink">{error || 'Case not found'}</h2>
        <Link to="/doctor/cases" className="text-xs text-magenta hover:underline">
          ← Return to Case Queue
        </Link>
      </div>
    );
  }

  const priorityColor =
    caseData.priority === 'emergency'
      ? 'bg-magenta text-cream animate-pulse'
      : caseData.priority === 'urgent'
      ? 'bg-ink text-cream'
      : caseData.priority === 'elevated'
      ? 'bg-cream text-ink border border-ink/15'
      : 'bg-creamdeep text-inkmute border border-ink/10';

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Link to="/doctor/cases" className="text-inkmute hover:text-ink transition-colors mr-1" title="Back to Case Queue">
              <iconify-icon icon="ph:arrow-left-bold" width="16" height="16"></iconify-icon>
            </Link>
            <span className="font-mono text-xl font-bold text-ink">
              {caseData.public_case_id}
            </span>
            <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${priorityColor}`}>
              {caseData.priority}
            </span>
          </div>
          <p className="text-xs text-inkmute">
            Patient: <strong className="text-ink">{caseData.patient_name}</strong> ({caseData.patient_age}y, {caseData.patient_gender}) • Language: {caseData.preferred_language.toUpperCase()}
          </p>
        </div>

        {/* Status selector & Actions */}
        <div className="flex flex-wrap items-center gap-3 self-stretch sm:self-auto">
          {doctor && caseData.assigned_doctor_id !== doctor.id && (
            <button
              type="button"
              disabled={isClaiming}
              onClick={async () => {
                setIsClaiming(true);
                try {
                  await assignCase(caseData.public_case_id || caseData.id);
                  await loadCase();
                } catch (err) {
                  console.error(err);
                  alert('Failed to assign case.');
                } finally {
                  setIsClaiming(false);
                }
              }}
              className="pill pill-secondary px-3 py-1.5 text-xs font-semibold"
              title="Claim this case under your active clinical care"
            >
              <iconify-icon icon="ph:user-plus-bold" width="13" height="13"></iconify-icon>
              <span>{isClaiming ? 'Claiming...' : 'Assign to Me'}</span>
            </button>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs text-inkmute font-medium">Status:</label>
            <select
              value={caseData.status}
              disabled={updatingStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="border border-ink/14 rounded-xl px-3 py-1.5 text-xs bg-cream text-ink font-medium focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
            >
              <option value="submitted">New Intake (Submitted)</option>
              <option value="under_review">Under Review</option>
              <option value="response_submitted">Response Submitted</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <button
            onClick={handleDownloadFullReport}
            disabled={isDownloadingPdf}
            className="pill pill-ink px-4 py-2 text-xs font-medium"
          >
            <iconify-icon icon="ph:download-simple-bold" width="14" height="14"></iconify-icon>
            <span>{isDownloadingPdf ? 'Generating...' : 'Full A4 Report'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadReferralPdf}
            disabled={isDownloadingReferral}
            className="pill pill-magenta px-4 py-2 text-xs font-semibold"
            title="Download 1-Click Inter-Facility 108 Referral Slip PDF"
          >
            <iconify-icon icon="ph:ambulance-bold" width="14" height="14"></iconify-icon>
            <span>{isDownloadingReferral ? 'Generating Referral...' : '108 Referral Slip'}</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-ink/10 flex flex-wrap gap-1 text-xs font-medium text-inkmute">
        {[
          { id: 'info', label: 'Patient Info', icon: 'ph:user-bold' },
          { id: 'complaint', label: 'Complaint & Q&A', icon: 'ph:heartbeat-bold' },
          { id: 'documents', label: `Documents (${caseData.documents?.length || 0})`, icon: 'ph:file-text-bold' },
          { id: 'measurements', label: `Vitals (${caseData.measurements?.length || 0})`, icon: 'ph:activity-bold' },
          { id: 'triage', label: 'Triage Logic', icon: 'ph:warning-bold' },
          { id: 'notes', label: `Clinical Notes (${caseData.notes?.length || 0})`, icon: 'ph:stethoscope-bold' },
          { id: 'treatment', label: 'Treatment & Rx', icon: 'ph:pill-bold' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 font-medium transition-all ${
                isActive
                  ? 'border-magenta text-magenta bg-creamdeep rounded-t-xl'
                  : 'border-transparent hover:text-ink'
              }`}
            >
              <iconify-icon icon={tab.icon} width="15" height="15"></iconify-icon>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Patient Info */}
      {activeTab === 'info' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
          <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
            Demographic & Contact Details
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-inkmute block mb-0.5">Full Name</span>
              <strong className="text-ink text-sm">{caseData.patient_name}</strong>
            </div>
            <div>
              <span className="text-inkmute block mb-0.5">Age</span>
              <span className="text-ink font-medium">{caseData.patient_age} Years</span>
            </div>
            <div>
              <span className="text-inkmute block mb-0.5">Biological Gender</span>
              <span className="text-ink font-medium capitalize">{caseData.patient_gender}</span>
            </div>
            <div>
              <span className="text-inkmute block mb-0.5">Contact Number</span>
              <span className="text-ink font-medium">{caseData.patient_contact || 'None provided'}</span>
            </div>
            <div>
              <span className="text-inkmute block mb-0.5">Preferred Language</span>
              <span className="text-ink font-medium uppercase">{caseData.preferred_language}</span>
            </div>
            <div>
              <span className="text-inkmute block mb-0.5">Registration Timestamp</span>
              <span className="text-ink font-medium">{new Date(caseData.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Complaint & Interview */}
      {activeTab === 'complaint' && (
        <div className="space-y-4">
          <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-3">
            <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
              Patient-Reported Chief Complaint
            </h3>
            <div className="bg-cream border border-ink/10 rounded-xl p-4 text-xs text-ink leading-relaxed">
              {caseData.chief_complaint}
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs pt-1">
              <div>
                <span className="text-inkmute font-medium">Duration:</span>{' '}
                <strong className="text-ink">{caseData.complaint_duration || 'Not specified'}</strong>
              </div>
              <div>
                <span className="text-inkmute font-medium">Self-Reported Severity:</span>{' '}
                <strong className="text-ink capitalize">{caseData.severity || 'Mild'}</strong>
              </div>
            </div>
          </div>

          <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-3">
            <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
              Medical Background
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="border border-ink/10 rounded-xl p-3.5 bg-cream">
                <span className="text-inkmute font-semibold block mb-1">Past Conditions</span>
                <p className="text-ink">{caseData.medical_history || 'None reported'}</p>
              </div>
              <div className="border border-ink/10 rounded-xl p-3.5 bg-cream">
                <span className="text-inkmute font-semibold block mb-1">Known Allergies</span>
                <p className="text-ink">{caseData.allergies || 'None reported'}</p>
              </div>
              <div className="border border-ink/10 rounded-xl p-3.5 bg-cream">
                <span className="text-inkmute font-semibold block mb-1">Current Medications</span>
                <p className="text-ink">{caseData.current_medications || 'None reported'}</p>
              </div>
            </div>
          </div>

          {caseData.responses && caseData.responses.length > 0 && (
            <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-3">
              <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
                Interview Follow-Up Q&A
              </h3>
              <div className="space-y-3">
                {caseData.responses.map((r: any, idx: number) => (
                  <div key={idx} className="border border-ink/10 rounded-xl p-3.5 bg-cream text-xs space-y-1">
                    <p className="font-semibold text-ink">Q: {r.question}</p>
                    <p className="text-inkmute pl-3 border-l-2 border-magenta">A: {r.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Documents (Full In-Browser Photo Inspection) */}
      {activeTab === 'documents' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <div>
              <h3 className="font-serif opsz-72 text-sm font-semibold text-ink flex items-center gap-2">
                <iconify-icon icon="ph:file-image-bold" width="16" height="16" className="text-magenta"></iconify-icon>
                <span>Uploaded Medical Records, Prescriptions & Reports</span>
              </h3>
              <p className="text-xs text-inkmute mt-0.5">
                Inspect original prescription handwriting and diagnostic report photos with in-browser zoom, rotation, and ink contrast enhancement.
              </p>
            </div>
            {caseData.documents && caseData.documents.length > 0 && (
              <span className="pill pill-ink text-xs px-3 py-1 font-semibold self-start sm:self-auto">
                {caseData.documents.length} File{caseData.documents.length > 1 ? 's' : ''} Attached
              </span>
            )}
          </div>

          {(!caseData.documents || caseData.documents.length === 0) ? (
            <div className="py-12 text-center text-xs text-inkmute space-y-1">
              <iconify-icon icon="ph:file-dashed-bold" width="36" height="36" className="mx-auto text-ink/30 block mb-2"></iconify-icon>
              <p className="font-medium text-ink">No prior records or prescriptions uploaded for this case.</p>
              <p className="text-[11px] text-inkmute">The patient completed the assessment without attaching external files.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-cream border border-magenta/20 rounded-xl p-3 text-xs text-ink flex items-center gap-2.5">
                <iconify-icon icon="ph:info-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
                <span>
                  <strong>Doctor Handwriting Inspection Tip:</strong> Click <strong>"Ink Enhance"</strong> or <strong>"Fullscreen"</strong> to decipher faint ballpoint pen marks or doctor shorthand.
                </span>
              </div>
              <div className="space-y-4">
                {caseData.documents.map((doc: any) => (
                  <DocumentOcrVerificationCard key={doc.id} doc={doc} caseId={caseData.public_case_id} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Measurements / Vitals */}
      {activeTab === 'measurements' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-5">
          <Esp32HardwareMonitor
            publicCaseId={caseData?.public_case_id}
            showSaveButton={true}
            onSaveToCase={async (data) => {
              await client.post(`/hardware/cases/${caseData.public_case_id}/measurements`, data);
              await loadCase();
            }}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <div>
              <h3 className="font-serif opsz-72 text-sm font-semibold text-ink">Recorded Case Vitals & Historical Sensor Readings</h3>
              <p className="text-xs text-inkmute">Physical telemetry recorded via ESP32-S3 Medical Kiosk or clinical intake examination.</p>
            </div>
            <button
              onClick={() => loadCase()}
              className="pill pill-secondary px-3.5 py-1.5 text-xs font-medium self-start"
              title="Refresh vital records"
            >
              <iconify-icon icon="ph:arrows-clockwise-bold" width="13" height="13"></iconify-icon>
              <span>Sync Vitals</span>
            </button>
          </div>

          {(!caseData.measurements || caseData.measurements.length === 0) ? (
            <p className="text-xs text-inkmute py-8 text-center">
              No vital sign measurements recorded yet. Connect ESP32 Medical Kiosk or record vitals during patient intake.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {caseData.measurements.map((m: any, idx: number) => {
                const val = Number(m.value);
                const isSpo2Critical = m.measurement_type === 'spo2' && val < 92;
                const isTempHigh = m.measurement_type === 'temperature' && val > 100.4;
                const isHrAbnormal = m.measurement_type === 'heart_rate' && (val > 100 || val < 55);
                const isAbnormal = isSpo2Critical || isTempHigh || isHrAbnormal;

                return (
                  <div
                    key={idx}
                    className={`border rounded-xl p-3.5 space-y-1 transition-all ${
                      isAbnormal ? 'border-magenta/40 bg-magenta/5 shadow-xs' : 'border-ink/10 bg-cream'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-inkmute">
                      <span className="uppercase font-semibold tracking-wider flex items-center gap-1">
                        {m.measurement_type.replace('_', ' ')}
                        {isAbnormal && (
                          <span className="bg-magenta text-cream text-[9px] font-bold px-1 rounded uppercase">
                            Alert
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] bg-ink/5 text-inkmute px-1.5 py-0.2 rounded font-mono">
                        {m.source}
                      </span>
                    </div>
                    <div className={`font-serif opsz-72 text-xl font-bold ${isAbnormal ? 'text-magenta' : 'text-ink'}`}>
                      {m.value}{' '}
                      <span className="text-xs font-sans font-normal text-inkmute">{m.unit}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-inkmute/70 pt-1">
                      <span>Quality: {m.signal_quality || 'fair'}</span>
                      <span>{new Date(m.recorded_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Triage Logic */}
      {activeTab === 'triage' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <h3 className="font-serif opsz-72 text-sm font-semibold text-ink">
              Rule-Based Triage Screening & Clinician Override
            </h3>
            <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${priorityColor}`}>
              Active Tier: {caseData.priority}
            </span>
          </div>

          <div className="bg-cream border border-ink/10 rounded-xl p-3.5 text-xs text-inkmute leading-relaxed">
            <strong className="text-ink">Development Notice:</strong> All rules and keyword thresholds are prototype examples for testing and demonstration. Qualified clinicians must make all final triage priority decisions.
          </div>

          {/* Interactive Clinician Triage Override */}
          <form onSubmit={handleTriageOverride} className="bg-cream border border-magenta/25 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-serif opsz-72 text-sm font-semibold text-ink">
                  Manual Triage Tier Override (Immutable Audit Log)
                </h4>
                <p className="text-[11px] text-inkmute">
                  Escalate or de-escalate this patient&apos;s urgency tier with a mandatory clinical rationale.
                </p>
              </div>
            </div>

            {triageOverrideMessage && (
              <div className="bg-emerald-500/10 border border-emerald-600/25 rounded-lg px-3 py-2 text-xs text-emerald-900 font-medium">
                {triageOverrideMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">
                  Target Triage Tier
                </label>
                <select
                  value={overridePriority}
                  onChange={(e) => setOverridePriority(e.target.value)}
                  className="w-full border border-ink/15 rounded-xl px-3 py-2 text-xs bg-creamdeep text-ink font-semibold focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                >
                  <option value="emergency">EMERGENCY (Immediate)</option>
                  <option value="urgent">URGENT (Priority)</option>
                  <option value="elevated">ELEVATED (Monitor)</option>
                  <option value="normal">NORMAL (Routine)</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-ink mb-1">
                  Clinical Justification (Required)
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Severe dehydration on exam despite borderline automated score"
                  className="w-full border border-ink/15 rounded-xl px-3 py-2 text-xs bg-creamdeep text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isOverridingTriage}
                  className="w-full pill pill-magenta px-4 py-2 text-xs font-semibold justify-center disabled:opacity-50"
                >
                  {isOverridingTriage ? 'Saving Override...' : 'Apply Triage Override'}
                </button>
              </div>
            </div>
          </form>

          {caseData.triage_decisions && caseData.triage_decisions.length > 0 ? (
            <div className="space-y-3">
              {caseData.triage_decisions.map((t: any, idx: number) => (
                <div key={idx} className="border border-ink/10 rounded-xl p-4 bg-cream space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">
                      Evaluated Priority: <span className="uppercase text-magenta font-bold">{t.priority}</span>
                    </span>
                    <span className="text-inkmute font-mono text-[11px]">Rule v{t.rule_version}</span>
                  </div>
                  <p className="text-inkmute whitespace-pre-line leading-relaxed">{t.reason}</p>
                  <p className="text-[11px] text-inkmute/60">Timestamp: {new Date(t.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-inkmute py-6 text-center">No triage evaluation records.</p>
          )}
        </div>
      )}

      {/* Tab 6: Clinical Doctor Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-5">
          <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
            <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
              Add Clinical Note
            </h3>
            <form onSubmit={handleAddNote} className="space-y-3.5">
              <div className="flex items-center gap-2">
                <label className="text-xs text-inkmute font-medium">Note Type:</label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="border border-ink/14 rounded-xl px-3 py-1.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                >
                  <option value="assessment">Assessment</option>
                  <option value="plan">Plan</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="general">General</option>
                </select>
              </div>

              <textarea
                rows={3}
                required
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Enter clinical observations, differential diagnosis, or notes for colleagues..."
                className="w-full border border-ink/14 rounded-xl p-3 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />

              <button
                type="submit"
                disabled={isAddingNote}
                className="pill pill-ink px-5 py-2 text-xs font-medium"
              >
                {isAddingNote ? 'Saving Note...' : 'Add Note to Case'}
              </button>
            </form>
          </div>

          <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-3">
            <h3 className="font-serif opsz-72 text-sm font-semibold text-ink border-b border-ink/10 pb-3">
              Case Notes History
            </h3>
            {(!caseData.notes || caseData.notes.length === 0) ? (
              <p className="text-xs text-inkmute py-6 text-center">No clinical notes recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {caseData.notes.map((n: any, idx: number) => (
                  <div key={idx} className="border border-ink/10 rounded-xl p-3.5 bg-cream text-xs space-y-1">
                    <div className="flex items-center justify-between text-inkmute">
                      <span className="font-semibold uppercase tracking-wider text-magenta">{n.note_type}</span>
                      <span className="text-[11px]">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-ink whitespace-pre-line leading-relaxed">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Treatment & Rx */}
      {activeTab === 'treatment' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/10 pb-3">
            <div>
              <h3 className="font-serif opsz-72 text-sm font-semibold text-ink">Physician Treatment Plan & Prescription</h3>
              <p className="text-xs text-inkmute">Structured medication orders, generic Jan Aushadhi formulations, and patient discharge guidance.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                defaultValue=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const preset = CLINICAL_PRESETS.find((p) => p.id === val);
                  if (preset) {
                    setTreatmentAssessment(preset.diagnosis);
                    setTreatmentDisposition('Outpatient Home Care');
                    setTreatmentNextSteps(preset.advice);
                    setTreatmentFollowUp(preset.followUp);
                    setTreatmentWarnings(preset.redFlags);
                    setMedicines(preset.medicines);
                  }
                  e.target.value = '';
                }}
                className="border border-ink/14 rounded-xl px-2.5 py-1.5 text-xs bg-cream text-ink font-semibold focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
              >
                <option value="">⚡ Apply Clinical Preset...</option>
                {CLINICAL_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              {caseData.treatment?.is_finalized && (
                <span className="inline-flex items-center gap-1 bg-magenta/10 text-magenta border border-magenta/20 px-3 py-1 rounded-full text-xs font-semibold">
                  <iconify-icon icon="ph:check-bold" width="13" height="13"></iconify-icon>
                  <span>Finalized</span>
                </span>
              )}
            </div>
          </div>

          {/* Patient's Uploaded Prescription Photo Inspection Panel (Instant In-Checkup Reference) */}
          {caseData.documents && caseData.documents.length > 0 && (
            <div className="bg-cream border-2 border-magenta/25 rounded-2xl p-4 md:p-5 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-magenta animate-pulse"></span>
                  <div>
                    <h4 className="font-serif opsz-72 font-semibold text-sm text-ink flex items-center gap-2">
                      <span>Patient's Uploaded Prescription / Lab Photo</span>
                      <span className="text-[10px] bg-magenta/10 text-magenta font-semibold px-2 py-0.5 rounded-full border border-magenta/20">
                        {caseData.documents.length} File{caseData.documents.length > 1 ? 's' : ''}
                      </span>
                    </h4>
                    <p className="text-[11px] text-inkmute">
                      Inspect previous doctor's handwriting directly here while prescribing medicines below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrescriptionRef(!showPrescriptionRef)}
                  className="pill pill-magenta px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <iconify-icon icon={showPrescriptionRef ? "ph:eye-slash-bold" : "ph:eye-bold"} width="13" height="13"></iconify-icon>
                  <span>{showPrescriptionRef ? 'Hide Prescription Photo' : 'Inspect Handwriting / Photo'}</span>
                </button>
              </div>

              {showPrescriptionRef && (
                <div className="pt-2 border-t border-ink/8 space-y-3">
                  <div className="space-y-4">
                    {caseData.documents.map((doc: any) => (
                      <DocumentOcrVerificationCard key={doc.id} doc={doc} caseId={caseData.public_case_id} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Clinical Diagnosis / Assessment
              </label>
              <textarea
                rows={2}
                value={treatmentAssessment}
                onChange={(e) => setTreatmentAssessment(e.target.value)}
                placeholder="e.g. Acute Upper Respiratory Tract Infection (viral)"
                className="w-full border border-ink/14 rounded-xl p-2.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Patient Disposition
              </label>
              <input
                type="text"
                value={treatmentDisposition}
                onChange={(e) => setTreatmentDisposition(e.target.value)}
                placeholder="e.g. Home rest, referral to Cardiology, etc."
                className="w-full border border-ink/14 rounded-xl px-3 py-2 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />
            </div>
          </div>

          {/* Medicines List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-ink">
                Medications to Prescribe (Prescription Formulary)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowShopModal(true)}
                  className="pill pill-magenta px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <iconify-icon icon="ph:shopping-cart-bold" width="13" height="13"></iconify-icon>
                  <span>Add from Medical Shop (PMBJP)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMedicines([
                      ...medicines,
                      {
                        medicine_name: '',
                        strength: '',
                        dosage: '',
                        route: 'oral',
                        frequency: 'TDS (thrice daily)',
                        duration: '5 days',
                        instructions: 'Take after meals',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs text-ink font-semibold hover:underline bg-cream px-2.5 py-1.5 rounded-xl border border-ink/10"
                >
                  <iconify-icon icon="ph:plus-bold" width="13" height="13"></iconify-icon> Manual Row
                </button>
              </div>
            </div>

            {addedToast && (
              <div className="bg-magenta text-cream p-2.5 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
                <span>✓ {addedToast}</span>
                <button onClick={() => setAddedToast(null)} className="text-cream/80 hover:text-cream">
                  <iconify-icon icon="ph:x-bold" width="14" height="14"></iconify-icon>
                </button>
              </div>
            )}

            <div className="space-y-2">
              {medicines.map((med, idx) => (
                <div key={idx} className="border border-ink/10 rounded-xl p-3 bg-cream grid grid-cols-1 sm:grid-cols-6 gap-2 items-center text-xs">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Medicine Name (e.g. Paracetamol)"
                      value={med.medicine_name}
                      onChange={(e) => {
                        const copy = [...medicines];
                        copy[idx].medicine_name = e.target.value;
                        setMedicines(copy);
                      }}
                      className="w-full border border-ink/12 rounded-lg px-2.5 py-1.5 bg-creamdeep text-ink font-medium"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Strength (500mg)"
                      value={med.strength || ''}
                      onChange={(e) => {
                        const copy = [...medicines];
                        copy[idx].strength = e.target.value;
                        setMedicines(copy);
                      }}
                      className="w-full border border-ink/12 rounded-lg px-2.5 py-1.5 bg-creamdeep text-ink"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Freq (TDS / BD)"
                      value={med.frequency || ''}
                      onChange={(e) => {
                        const copy = [...medicines];
                        copy[idx].frequency = e.target.value;
                        setMedicines(copy);
                      }}
                      className="w-full border border-ink/12 rounded-lg px-2.5 py-1.5 bg-creamdeep text-ink"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Duration (5 days)"
                      value={med.duration || ''}
                      onChange={(e) => {
                        const copy = [...medicines];
                        copy[idx].duration = e.target.value;
                        setMedicines(copy);
                      }}
                      className="w-full border border-ink/12 rounded-lg px-2.5 py-1.5 bg-creamdeep text-ink"
                    />
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setMedicines(medicines.filter((_, i) => i !== idx))}
                      className="text-magenta hover:text-magentadeep p-1.5 rounded-lg hover:bg-magenta/10 transition-colors"
                      title="Remove medicine"
                    >
                      <iconify-icon icon="ph:trash-bold" width="16" height="16"></iconify-icon>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Follow-Up Instructions
              </label>
              <textarea
                rows={2}
                value={treatmentFollowUp}
                onChange={(e) => setTreatmentFollowUp(e.target.value)}
                placeholder="e.g. Return in 3 days if symptoms do not improve"
                className="w-full border border-ink/14 rounded-xl p-2.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Warning Signs / Red Flags
              </label>
              <textarea
                rows={2}
                value={treatmentWarnings}
                onChange={(e) => setTreatmentWarnings(e.target.value)}
                placeholder="e.g. Go to emergency immediately if chest pain or breathlessness develops"
                className="w-full border border-ink/14 rounded-xl p-2.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-ink/10 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSavingTreatment}
              onClick={handleSaveTreatment}
              className="pill pill-secondary px-5 py-2.5 text-xs font-medium"
            >
              {isSavingTreatment ? 'Saving Draft...' : 'Save Draft Plan'}
            </button>

            <button
              type="button"
              disabled={isFinalizing}
              onClick={handleFinalizeTreatment}
              className="pill pill-magenta px-6 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              <iconify-icon icon="ph:check-circle-bold" width="15" height="15"></iconify-icon>
              <span>{isFinalizing ? 'Finalizing...' : 'Finalize & Send Response to Patient'}</span>
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp SMS & AI Solution Resolution Modal */}
      {finalizedWhatsAppModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-creamdeep rounded-2xl shadow-2xl max-w-xl w-full border border-ink/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-ink text-cream p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-magenta text-cream flex items-center justify-center">
                  <iconify-icon icon="ph:check-bold" width="16" height="16"></iconify-icon>
                </div>
                <div>
                  <h3 className="font-serif opsz-72 text-sm font-semibold">Treatment Finalized & WhatsApp Dispatched</h3>
                  <p className="text-[11px] text-cream/60">
                    Patient SMS notification & Jan Aushadhi medicine ordering link generated
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFinalizedWhatsAppModal(null)}
                className="text-cream/70 hover:text-cream p-1.5 rounded-lg hover:bg-cream/10 transition-colors"
              >
                <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between bg-cream border border-ink/10 p-3 rounded-xl text-ink">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Recipient:</span>
                  <span className="font-mono bg-creamdeep px-2 py-0.5 rounded border border-ink/10">
                    {finalizedWhatsAppModal.recipient_contact || caseData?.patient_contact || 'Registered Mobile Number'}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-magenta bg-magenta/10 px-2.5 py-0.5 rounded-full border border-magenta/20">
                  <iconify-icon icon="ph:check-bold" width="11" height="11"></iconify-icon>
                  Dispatched
                </span>
              </div>

              {finalizedWhatsAppModal.ai_summary && (
                <div className="bg-cream border border-ink/10 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 text-magenta font-semibold mb-1">
                    <iconify-icon icon="ph:sparkle-fill" width="14" height="14"></iconify-icon>
                    <span>AI Solution Summary (Empathetic Clinical Guidance)</span>
                  </div>
                  <p className="text-inkmute leading-relaxed text-xs">
                    {finalizedWhatsAppModal.ai_summary}
                  </p>
                </div>
              )}

              <div>
                <label className="block font-semibold text-ink mb-1.5">
                  WhatsApp SMS Message Preview:
                </label>
                <pre className="w-full bg-ink text-cream/90 rounded-xl p-3.5 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-ink/20 leading-relaxed select-all">
                  {finalizedWhatsAppModal.whatsapp_message}
                </pre>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-ink/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(finalizedWhatsAppModal.whatsapp_message || '');
                      setCopiedMessage(true);
                      setTimeout(() => setCopiedMessage(false), 2500);
                    }}
                    className="pill pill-secondary px-3 py-1.5 text-xs font-semibold"
                  >
                    <iconify-icon icon={copiedMessage ? 'ph:check-bold' : 'ph:copy-bold'} width="13" height="13"></iconify-icon>
                    <span>{copiedMessage ? 'Copied!' : 'Copy Message'}</span>
                  </button>

                  {finalizedWhatsAppModal.order_url && (
                    <a
                      href={finalizedWhatsAppModal.order_url}
                      target="_blank"
                      rel="noreferrer"
                      className="pill pill-ghost-ink px-3 py-1.5 text-xs font-semibold"
                    >
                      <iconify-icon icon="ph:shopping-bag-bold" width="13" height="13"></iconify-icon>
                      <span>Preview Order</span>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {finalizedWhatsAppModal.whatsapp_bot_url && (
                    <a
                      href={finalizedWhatsAppModal.whatsapp_bot_url}
                      target="_blank"
                      rel="noreferrer"
                      className="pill pill-ink px-3 py-1.5 text-xs font-semibold"
                    >
                      <iconify-icon icon="ph:robot-bold" width="13" height="13"></iconify-icon>
                      <span>WhatsApp Bot</span>
                    </a>
                  )}
                  <a
                    href={finalizedWhatsAppModal.whatsapp_link}
                    target="_blank"
                    rel="noreferrer"
                    className="pill pill-magenta px-3.5 py-1.5 text-xs font-semibold"
                  >
                    <iconify-icon icon="ph:paper-plane-tilt-bold" width="13" height="13"></iconify-icon>
                    <span>Send on WhatsApp</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setFinalizedWhatsAppModal(null)}
                    className="pill pill-ghost-ink px-3 py-1.5 text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Medical Shop Picker Modal for Clinicians ── */}
      {showShopModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-creamdeep rounded-3xl shadow-2xl max-w-4xl w-full border border-ink/10 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-ink text-cream p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-magenta flex items-center justify-center shadow-sm">
                  <iconify-icon icon="ph:pill-fill" width="18" height="18"></iconify-icon>
                </div>
                <div>
                  <h3 className="font-serif opsz-72 text-sm sm:text-base font-semibold">
                    Medical Shop Formulary • Prescribe Available Medicines
                  </h3>
                  <p className="text-[11px] text-cream/60">
                    Pradhan Mantri Bharatiya Janaushadhi Pariyojana • Subsidized Stock with Real Packaging
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShopModal(false)}
                className="text-cream/70 hover:text-cream p-1.5 rounded-lg hover:bg-cream/10"
              >
                <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 bg-cream border-b border-ink/8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="relative flex-1 w-full">
                <iconify-icon
                  icon="ph:magnifying-glass-bold"
                  width="15"
                  height="15"
                  style={{ color: '#5a544a', position: 'absolute', left: '10px', top: '10px' } as any}
                ></iconify-icon>
                <input
                  type="text"
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="Search available medicines by name or generic formula..."
                  className="w-full border border-ink/14 rounded-xl pl-8 pr-3 py-1.5 bg-creamdeep text-ink text-xs focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none font-semibold">
                {['All', 'Fever & Pain', 'Antibiotics & Infection', 'Digestion & ORS', 'Chronic Care (BP & Sugar)', 'First Aid & Devices'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setShopCategory(c)}
                    className={`px-3 py-1 rounded-lg whitespace-nowrap transition-all ${
                      shopCategory === c ? 'bg-ink text-cream' : 'bg-creamdeep text-inkmute hover:text-ink'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Products List with Real Photos */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {INITIAL_MEDICINE_CATALOG.filter((p) => {
                const matchCat = shopCategory === 'All' || p.category === shopCategory;
                const matchQ =
                  !shopSearch.trim() ||
                  p.name.toLowerCase().includes(shopSearch.toLowerCase()) ||
                  p.generic_name.toLowerCase().includes(shopSearch.toLowerCase());
                return matchCat && matchQ;
              }).map((prod) => (
                <div
                  key={prod.id}
                  className="bg-cream rounded-2xl border border-ink/8 p-3.5 flex flex-col justify-between space-y-3 hover:border-magenta/40 transition-colors shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={prod.image}
                      alt={prod.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border border-ink/8"
                    />
                    <div className="min-w-0">
                      <span className="text-[9px] font-bold uppercase text-magenta block">
                        {prod.category}
                      </span>
                      <h4 className="font-serif opsz-72 text-xs font-semibold text-ink line-clamp-1" title={prod.name}>
                        {prod.name}
                      </h4>
                      <p className="text-[10px] text-inkmute line-clamp-1">{prod.generic_name}</p>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="font-bold text-xs text-ink">₹{prod.price}</span>
                        <span className="text-[10px] text-inkmute line-through">₹{prod.mrp}</span>
                        <span className="text-[9px] font-bold text-green-700">Save {prod.discount_pct}%</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const cleanMed = {
                        medicine_name: prod.name,
                        strength: prod.strength,
                        dosage: prod.dosage_form === 'Syrup' ? '10ml' : (prod.dosage_form === 'Sachet' ? '1 packet' : '1 tablet'),
                        route: prod.dosage_form === 'Ointment' ? 'topical' : 'oral',
                        frequency: prod.dosage_form === 'Device' ? 'As needed' : 'TDS (thrice daily)',
                        duration: prod.dosage_form === 'Device' ? 'Continuous' : '5 days',
                        instructions: prod.usage_instructions,
                        unit_price: prod.price,
                      };
                      if (medicines.length === 1 && !medicines[0].medicine_name) {
                        setMedicines([cleanMed]);
                      } else {
                        setMedicines([...medicines, cleanMed]);
                      }
                      setAddedToast(`Added ${prod.name} to prescription!`);
                      setTimeout(() => setAddedToast(null), 3000);
                    }}
                    className="w-full pill pill-ink py-1.5 text-[11px] font-semibold flex items-center justify-center gap-1 hover:bg-magenta hover:text-cream transition-colors"
                  >
                    <iconify-icon icon="ph:plus-bold" width="12" height="12"></iconify-icon>
                    <span>+ Add to Prescription</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 bg-cream border-t border-ink/8 flex items-center justify-between text-xs">
              <span className="text-inkmute text-[11px]">
                {medicines.filter((m) => m.medicine_name).length} medicine(s) in active prescription
              </span>
              <button
                type="button"
                onClick={() => setShowShopModal(false)}
                className="pill pill-ink px-5 py-2 font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
