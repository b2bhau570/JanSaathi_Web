import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { checkCase, getReceipt } from '../../api/patientApi';

export const TrackCasePage: React.FC = () => {
  const { caseId: paramCaseId } = useParams<{ caseId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Input states for case lookup
  const initialCaseId = paramCaseId || searchParams.get('id') || '';
  const initialToken = searchParams.get('token') || searchParams.get('access_token') || (initialCaseId ? sessionStorage.getItem(`case_token_${initialCaseId}`) || '' : '');

  const [inputCaseId, setInputCaseId] = useState(initialCaseId);
  const [inputToken, setInputToken] = useState(initialToken);

  const [activeCaseId, setActiveCaseId] = useState<string | null>(initialCaseId || null);
  const [activeToken, setActiveToken] = useState<string | null>(initialToken || null);

  const [caseData, setCaseData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const loadCase = async (cid: string, tok: string) => {
    if (!cid.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await checkCase(cid.trim(), tok.trim());
      setCaseData(data);
      setActiveCaseId(cid.trim());
      setActiveToken(tok.trim());
      if (tok.trim()) {
        sessionStorage.setItem(`case_token_${cid.trim()}`, tok.trim());
      }
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Invalid access token for this Case ID. Please verify your Case ID and the access token issued during intake.');
      } else if (err.response?.status === 404) {
        setError(`Case "${cid}" not found. Please verify the Case ID format (e.g. JS-XXXXXXXX).`);
      } else {
        setError('Failed to retrieve case details. Please check your internet connection.');
      }
      setCaseData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initialCaseId || !initialToken) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void loadCase(initialCaseId, initialToken);
    });
    return () => {
      active = false;
    };
  }, [initialCaseId, initialToken]);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCaseId.trim()) {
      alert('Please enter your Case ID.');
      return;
    }
    const tok = inputToken.trim() || sessionStorage.getItem(`case_token_${inputCaseId.trim()}`) || '';
    if (!tok) {
      alert('Please provide your secret Case Access Token (shown when you submitted your assessment).');
      return;
    }
    setSearchParams({ id: inputCaseId.trim(), token: tok });
    loadCase(inputCaseId.trim(), tok);
  };

  const handleDownloadReceipt = async () => {
    if (!activeCaseId || !activeToken) return;
    setDownloading(true);
    try {
      const blob = await getReceipt(activeCaseId, activeToken);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JanSaathi-ClinicalSummary-${activeCaseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert('Could not download clinical receipt.');
    } finally {
      setDownloading(false);
    }
  };

  // Helper for status progress steps
  const getStepStatus = (stepIndex: number, currentStatus: string) => {
    const statusMap: Record<string, number> = {
      submitted: 1,
      awaiting_review: 1,
      under_review: 2,
      response_submitted: 3,
      treatment_planned: 3,
      closed: 4,
    };
    const currentStep = statusMap[currentStatus] || 1;
    if (currentStep > stepIndex) return 'complete';
    if (currentStep === stepIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 font-sans">
      {/* ── Page Header ── */}
      <div className="text-center max-w-xl mx-auto space-y-2">
        <span className="eyebrow text-magenta font-bold text-[11px]">
          Patient Tele-Health Portal • Track Case (ପ୍ରେସକ୍ରିପସନ୍ ଟ୍ରାକିଂ)
        </span>
        <h1 className="font-serif opsz-96 font-medium text-3xl sm:text-4xl text-ink tracking-tight">
          Track Your Case & Prescription
        </h1>
        <p className="text-xs sm:text-sm text-inkmute leading-relaxed">
          Check doctor review progress, view signed clinician triage & care note, and order subsidized Jan Aushadhi medicines online.
        </p>
      </div>

      {/* ── Lookup Form Box ── */}
      <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleLookupSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Public Case ID <span className="text-magenta">*</span>
              </label>
              <div className="relative">
                <iconify-icon
                  icon="ph:hash-bold"
                  width="16"
                  height="16"
                  style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '12px' } as any}
                ></iconify-icon>
                <input
                  type="text"
                  required
                  value={inputCaseId}
                  onChange={(e) => setInputCaseId(e.target.value.toUpperCase())}
                  placeholder="e.g. JS-ABC12345"
                  className="w-full font-mono font-semibold uppercase border border-ink/14 rounded-xl pl-9 pr-3.5 py-2.5 text-xs sm:text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Secret Access Token <span className="text-magenta">*</span>
              </label>
              <div className="relative">
                <iconify-icon
                  icon="ph:key-bold"
                  width="16"
                  height="16"
                  style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '12px' } as any}
                ></iconify-icon>
                <input
                  type="text"
                  required
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Enter token given after assessment or via WhatsApp"
                  className="w-full font-mono border border-ink/14 rounded-xl pl-9 pr-3.5 py-2.5 text-xs sm:text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-inkmute">
              🔒 End-to-end confidential patient verification. No public login password needed.
            </span>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto pill pill-ink px-6 py-2.5 text-xs font-bold"
            >
              {isLoading ? 'Verifying...' : 'Track Medical Case'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Error Message ── */}
      {error && (
        <div className="bg-magenta/10 border border-magenta/25 rounded-2xl p-5 text-center space-y-2 animate-in fade-in">
          <div className="w-10 h-10 rounded-full bg-magenta/15 text-magenta flex items-center justify-center mx-auto">
            <iconify-icon icon="ph:warning-circle-fill" width="22" height="22"></iconify-icon>
          </div>
          <h2 className="text-xs font-semibold text-ink">{error}</h2>
          <p className="text-[11px] text-inkmute">
            Need help? If you lost your token or have a medical emergency, call 108 or contact Jan Saathi support.
          </p>
        </div>
      )}

      {/* ── Loading Spinner ── */}
      {isLoading && (
        <div className="py-16 text-center text-inkmute space-y-3">
          <div className="animate-spin w-8 h-8 border-3 border-magenta border-t-transparent rounded-full mx-auto" />
          <p className="text-xs">Accessing clinical registry and retrieving physician notes...</p>
        </div>
      )}

      {/* ── Case Details Results ── */}
      {caseData && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Status Progress Bar */}
          <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink/8 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-magenta">Case Reference</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xl sm:text-2xl font-bold text-ink">
                    {caseData.public_case_id || activeCaseId}
                  </span>
                  <span className="bg-magenta/10 text-magenta border border-magenta/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                    {caseData.priority || 'Normal'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadReceipt}
                  disabled={downloading}
                  className="pill pill-secondary px-3.5 py-1.5 text-xs font-semibold"
                >
                  <iconify-icon icon="ph:download-simple-bold" width="13" height="13"></iconify-icon>
                  <span>{downloading ? 'Downloading...' : 'Clinical Receipt (PDF)'}</span>
                </button>
              </div>
            </div>

            {/* Stepper */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-xs">
              {[
                { title: '1. Intake Submitted', desc: 'Case securely registered', status: getStepStatus(1, caseData.status) },
                { title: '2. Under Doctor Review', desc: 'Physician evaluating vitals', status: getStepStatus(2, caseData.status) },
                { title: '3. Prescription Signed', desc: 'Rx ready & WhatsApp SMS', status: getStepStatus(3, caseData.status) },
                { title: '4. Closed / Care Complete', desc: 'Discharged or completed', status: getStepStatus(4, caseData.status) },
              ].map((step, idx) => {
                const isComplete = step.status === 'complete';
                const isCurrent = step.status === 'current';
                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isCurrent
                        ? 'bg-magenta/10 border-magenta/30 font-bold text-magenta'
                        : isComplete
                        ? 'bg-cream border-ink/10 text-ink'
                        : 'bg-cream/40 border-ink/6 text-inkmute/60'
                    }`}
                  >
                    <div className="flex items-center justify-center mb-1.5">
                      {isComplete ? (
                        <div className="w-5 h-5 rounded-full bg-magenta text-cream flex items-center justify-center text-xs">
                          ✓
                        </div>
                      ) : (
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                          isCurrent ? 'bg-magenta text-cream' : 'bg-ink/10 text-inkmute'
                        }`}>
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold">{step.title}</div>
                    <div className="text-[10px] text-inkmute/80 mt-0.5">{step.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Empathetic AI Solution Summary */}
          {caseData.treatment?.follow_up_instructions && (
            <div className="bg-gradient-to-r from-magenta/10 via-creamdeep to-creamdeep rounded-3xl border border-magenta/25 p-6 space-y-2">
              <div className="flex items-center gap-2 text-magenta font-bold text-xs uppercase tracking-wide">
                <iconify-icon icon="ph:sparkle-fill" width="16" height="16"></iconify-icon>
                <span>AI Clinical Resolution Summary (ସ୍ୱାସ୍ଥ୍ୟ ସମାଧାନ ସାରାଂଶ)</span>
              </div>
              <p className="text-ink text-xs sm:text-sm leading-relaxed whitespace-pre-line font-medium">
                {caseData.treatment.follow_up_instructions}
              </p>
            </div>
          )}

          {/* Official Doctor Prescription */}
          <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-ink/8 pb-4">
              <div>
                <h2 className="font-serif opsz-72 text-lg font-semibold text-ink flex items-center gap-2">
                  <iconify-icon icon="ph:stethoscope-bold" width="18" height="18" style={{ color: '#d6246e' }}></iconify-icon>
                  Official Medical Prescription & Treatment Plan
                </h2>
                <p className="text-xs text-inkmute mt-0.5">
                  Signed by Attending Clinician via Jan Saathi Health Network
                </p>
              </div>

              {/* 1-Click Order Medicines Button */}
              <Link
                to={`/shop?caseId=${caseData.public_case_id || activeCaseId}`}
                className="pill pill-magenta px-4 py-2 text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm"
              >
                <iconify-icon icon="ph:shopping-cart-bold" width="14" height="14"></iconify-icon>
                <span>Order Prescribed Medicines</span>
              </Link>
            </div>

            {/* Diagnosis & Advice */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-cream p-4 rounded-2xl border border-ink/8 space-y-1">
                <span className="text-inkmute font-semibold uppercase text-[10px] tracking-wide block">
                  Physician Diagnosis / Assessment
                </span>
                <p className="text-ink font-serif text-sm font-semibold">
                  {caseData.treatment?.assessment || caseData.doctor_response || 'Assessment completed under physician supervision.'}
                </p>
              </div>

              <div className="bg-cream p-4 rounded-2xl border border-ink/8 space-y-1">
                <span className="text-inkmute font-semibold uppercase text-[10px] tracking-wide block">
                  Patient Disposition
                </span>
                <p className="text-ink font-medium">
                  {caseData.treatment?.disposition || 'Outpatient Home Care & Hydration'}
                </p>
              </div>
            </div>

            {/* Prescribed Medicines List */}
            {caseData.treatment?.items && caseData.treatment.items.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Prescribed Medications (Generic Jan Aushadhi Formulary)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-cream rounded-2xl border border-ink/8 overflow-hidden">
                    <thead className="bg-creamdeep text-inkmute font-semibold border-b border-ink/8">
                      <tr>
                        <th className="p-3">Medicine Name</th>
                        <th className="p-3">Dosage & Strength</th>
                        <th className="p-3">Frequency</th>
                        <th className="p-3">Duration</th>
                        <th className="p-3">Special Instructions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/8">
                      {caseData.treatment.items.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-creamdeep/60">
                          <td className="p-3 font-semibold text-ink">
                            {item.medicine_name}
                          </td>
                          <td className="p-3 font-mono text-magenta">
                            {item.strength || item.dosage || '--'}
                          </td>
                          <td className="p-3 text-ink">
                            {item.frequency || 'As directed'}
                          </td>
                          <td className="p-3 text-inkmute">
                            {item.duration || '--'}
                          </td>
                          <td className="p-3 text-inkmute">
                            {item.instructions || 'Take after meals'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 bg-cream p-4 rounded-2xl border border-ink/8">
                  <span className="text-xs text-ink font-medium">
                    Need your medications delivered to your village or ready at Jan Aushadhi Kendra?
                  </span>
                  <Link
                    to={`/shop?caseId=${caseData.public_case_id || activeCaseId}`}
                    className="pill pill-ink px-5 py-2 text-xs font-bold"
                  >
                    <span>Proceed to Medical Shop</span>
                    <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-cream p-5 rounded-2xl border border-ink/8 text-center text-xs text-inkmute">
                Physician is currently formulating your prescription. You will receive an automated WhatsApp notification once signed.
              </div>
            )}

            {/* Red Flag Warnings */}
            {caseData.treatment?.warnings && (
              <div className="bg-magenta/8 border border-magenta/25 p-4 rounded-2xl text-xs space-y-1">
                <span className="font-bold text-magenta flex items-center gap-1.5">
                  <iconify-icon icon="ph:warning-bold" width="14" height="14"></iconify-icon>
                  Physician Red Flag Notice (ଜରୁରୀକାଳୀନ ଚେତାବନୀ):
                </span>
                <p className="text-ink leading-relaxed">{caseData.treatment.warnings}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

