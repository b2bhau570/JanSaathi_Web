import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { checkCase, getReceipt } from '../../api/patientApi';

export const CaseViewPage: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token =
    searchParams.get('token') ||
    (caseId ? sessionStorage.getItem(`case_token_${caseId}`) : null);

  const [caseData, setCaseData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!caseId || !token) {
      navigate(`/patient/case-access?id=${caseId || ''}`, { replace: true });
      return;
    }

    const fetchCase = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await checkCase(caseId, token);
        setCaseData(data);
      } catch (err: any) {
        console.error(err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError('Access denied. The access token is missing or invalid.');
        } else {
          setError('Failed to load case information.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCase();
  }, [caseId, token, navigate]);

  const handleDownloadReceipt = async () => {
    if (!caseId || !token) return;
    setDownloading(true);
    try {
      const blob = await getReceipt(caseId, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanSaathi-Receipt-${caseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      alert('Could not download receipt.');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-inkmute space-y-3">
        <div className="animate-spin w-8 h-8 border-3 border-magenta border-t-transparent rounded-full mx-auto" />
        <p className="text-sm">Verifying access credentials and loading case records...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-md mx-auto bg-creamdeep p-8 rounded-2xl border border-magenta/25 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-magenta/15 text-magenta flex items-center justify-center mx-auto">
          <iconify-icon icon="ph:warning-circle-fill" width="24" height="24"></iconify-icon>
        </div>
        <h2 className="font-serif opsz-72 text-lg font-semibold text-ink">Case Access Error</h2>
        <p className="text-xs text-inkmute">{error || 'Unable to retrieve case.'}</p>
        <Link
          to={`/patient/case-access?id=${caseId || ''}`}
          className="pill pill-ink px-5 py-2.5 text-xs inline-flex"
        >
          Re-enter Credentials
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-xl font-bold text-ink">
              {caseData.public_case_id}
            </span>
            <span className="text-[10px] uppercase font-semibold px-2.5 py-0.5 rounded-full border bg-magenta/10 text-magenta border-magenta/20">
              {caseData.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-inkmute">
            Submitted: {new Date(caseData.created_at).toLocaleString()}
          </p>
        </div>

        <button
          onClick={handleDownloadReceipt}
          disabled={downloading}
          className="pill pill-ink px-4 py-2 text-xs font-medium"
        >
          <iconify-icon icon="ph:download-simple-bold" width="14" height="14"></iconify-icon>
          <span>{downloading ? 'Downloading...' : 'Download Receipt PDF'}</span>
        </button>
      </div>

      {/* Patient & Complaint Summary */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-5">
        <h2 className="font-serif opsz-72 text-base font-semibold text-ink flex items-center gap-2 border-b border-ink/10 pb-3">
          <iconify-icon icon="ph:user-bold" width="16" height="16"></iconify-icon>
          <span>Patient Intake Summary</span>
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-inkmute block mb-0.5">Patient Name</span>
            <strong className="text-ink">{caseData.patient_name}</strong>
          </div>
          <div>
            <span className="text-inkmute block mb-0.5">Age & Gender</span>
            <span className="text-ink">
              {caseData.patient_age} yrs, {caseData.patient_gender}
            </span>
          </div>
          <div>
            <span className="text-inkmute block mb-0.5">Language</span>
            <span className="text-ink uppercase">{caseData.preferred_language}</span>
          </div>
        </div>

        <div className="pt-2">
          <span className="text-xs text-inkmute font-medium block mb-1.5">Chief Health Complaint:</span>
          <div className="bg-cream border border-ink/10 rounded-xl p-3.5 text-xs text-ink leading-relaxed">
            {caseData.chief_complaint}
          </div>
        </div>
      </div>

      {/* Doctor Review / Treatment Section */}
      {caseData.treatment && caseData.treatment.is_finalized ? (
        <div className="bg-creamdeep rounded-2xl border-2 border-magenta/30 p-6 space-y-5">
          <div className="flex items-center gap-2.5 text-ink font-serif opsz-72 font-semibold text-lg">
            <div className="w-7 h-7 rounded-full bg-magenta text-cream flex items-center justify-center">
              <iconify-icon icon="ph:check-bold" width="14" height="14"></iconify-icon>
            </div>
            <span>Doctor Assessment & Instructions</span>
          </div>

          <div className="space-y-3.5 text-xs text-ink bg-cream p-5 rounded-xl border border-ink/10">
            {caseData.treatment.ai_summary && (
              <div className="bg-magenta/5 border border-magenta/20 p-3.5 rounded-xl text-ink space-y-1">
                <div className="flex items-center gap-1.5 text-magenta font-semibold">
                  <iconify-icon icon="ph:sparkle-fill" width="14" height="14"></iconify-icon>
                  <span>AI Clinical Solution Summary (ସ୍ୱାସ୍ଥ୍ୟ ପରାମର୍ଶ ସାରାଂଶ)</span>
                </div>
                <p className="leading-relaxed text-xs text-inkmute">{caseData.treatment.ai_summary}</p>
              </div>
            )}

            {caseData.treatment.assessment && (
              <div>
                <strong className="text-ink block mb-0.5 font-semibold">Clinical Assessment:</strong>
                <p className="leading-relaxed text-inkmute">{caseData.treatment.assessment}</p>
              </div>
            )}

            {caseData.treatment.follow_up_instructions && (
              <div>
                <strong className="text-ink block mb-0.5 font-semibold">Follow-Up Guidance:</strong>
                <p className="leading-relaxed text-inkmute">{caseData.treatment.follow_up_instructions}</p>
              </div>
            )}

            {caseData.treatment.warnings && (
              <div className="bg-magenta/10 border border-magenta/25 p-3 rounded-xl text-magentadeep">
                <strong>Precautions / Warning Signs:</strong> {caseData.treatment.warnings}
              </div>
            )}
          </div>

          {/* Medicines prescribed */}
          {caseData.treatment.items && caseData.treatment.items.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <iconify-icon icon="ph:pill-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
                <span>Prescribed Medications</span>
              </h3>
              <div className="overflow-x-auto bg-cream rounded-xl border border-ink/10">
                <table className="w-full text-left text-xs">
                  <thead className="bg-creamdeep text-ink font-semibold border-b border-ink/10">
                    <tr>
                      <th className="p-2.5">Medicine</th>
                      <th className="p-2.5">Strength / Dosage</th>
                      <th className="p-2.5">Frequency</th>
                      <th className="p-2.5">Duration</th>
                      <th className="p-2.5">Instructions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/8">
                    {caseData.treatment.items.map((m: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium text-ink">{m.medicine_name}</td>
                        <td className="p-2.5 text-inkmute">{m.strength || m.dosage || '—'}</td>
                        <td className="p-2.5 text-inkmute">{m.frequency || '—'}</td>
                        <td className="p-2.5 text-inkmute">{m.duration || '—'}</td>
                        <td className="p-2.5 text-inkmute">{m.instructions || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subsidized Jan Aushadhi Kendra Medicine Ordering Callout */}
          <div className="bg-ink text-cream rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-serif opsz-72 font-semibold text-sm">
                <iconify-icon icon="ph:shopping-bag-fill" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
                <span>ପ୍ରଧାନମନ୍ତ୍ରୀ ଜନ ଔଷଧି କେନ୍ଦ୍ର - Order Subsidized Medicines</span>
              </div>
              <p className="text-xs text-cream/70">
                Order prescribed generic medications at 70–90% subsidized rates with Express Drone Delivery / Speed Post.
              </p>
            </div>
            <Link
              to={`/patient/orders/${caseId}?token=${token}`}
              className="shrink-0 pill pill-magenta px-4 py-2.5 text-xs font-medium"
            >
              <iconify-icon icon="ph:shopping-bag-bold" width="14" height="14"></iconify-icon>
              <span>Order Medicines Online</span>
            </Link>
          </div>

          {/* 24/7 WhatsApp AI Assistant Callout */}
          <div className="bg-creamdeep border border-ink/10 text-ink rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-serif opsz-72 font-semibold text-sm">
                <iconify-icon icon="ph:whatsapp-logo-fill" width="16" height="16" style={{ color: '#25D366' }}></iconify-icon>
                <span>ଜନସାଥୀ WhatsApp AI ସ୍ୱାସ୍ଥ୍ୟ ବଟ୍ (24/7 AI Health Bot)</span>
              </div>
              <p className="text-xs text-inkmute">
                Ask medicine doubts, food/milk instructions, dosage schedules & get instant AI replies directly.
              </p>
            </div>
            <Link
              to={`/patient/whatsapp/${caseId}?token=${token}`}
              className="shrink-0 pill pill-ink px-4 py-2.5 text-xs font-medium"
            >
              <iconify-icon icon="ph:chat-circle-dots-bold" width="14" height="14"></iconify-icon>
              <span>Chat on WhatsApp Bot</span>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-creamdeep border border-ink/10 rounded-2xl p-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-magenta/10 text-magenta flex items-center justify-center shrink-0">
            <iconify-icon icon="ph:hourglass-medium-bold" width="20" height="20"></iconify-icon>
          </div>
          <div className="space-y-1 text-xs text-ink">
            <h3 className="font-serif opsz-72 font-semibold text-sm">Doctor Review Pending</h3>
            <p className="leading-relaxed text-inkmute">
              Your intake has been placed in the hospital queue. An attending clinician is evaluating your symptoms. Finalized instructions and medications will appear on this page as soon as the review is complete.
            </p>
          </div>
        </div>
      )}

      {/* Back link */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-inkmute hover:text-magenta font-medium transition-colors"
        >
          <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
          <span>Return to Home Page</span>
        </Link>
      </div>
    </div>
  );
};
