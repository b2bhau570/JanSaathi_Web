import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { checkCase } from '../../api/patientApi';

export const CaseAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [caseId, setCaseId] = useState(searchParams.get('id') || '');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId.trim()) {
      setError('Please enter your Public Case ID (e.g. JS-ABC12345).');
      return;
    }
    if (!token.trim()) {
      setError('Please enter your Secret Case Access Token.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await checkCase(caseId.trim(), token.trim());
      sessionStorage.setItem(`case_token_${caseId.trim()}`, token.trim());
      navigate(`/patient/case/${caseId.trim()}?token=${encodeURIComponent(token.trim())}`);
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 404) {
        setError('Case not found. Please verify the Case ID.');
      } else if (err.response?.status === 403 || err.response?.status === 401) {
        setError('Invalid access token. Please check that you copied the complete token.');
      } else {
        setError('Could not retrieve case. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-magenta/10 text-magenta rounded-full flex items-center justify-center mx-auto">
          <iconify-icon icon="ph:magnifying-glass-bold" width="22" height="22"></iconify-icon>
        </div>
        <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">Check Case Status</h1>
        <p className="text-xs text-inkmute">
          Enter your Case ID and the Access Token you received upon submission.
        </p>
      </div>

      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 md:p-8 space-y-5">
        {error && (
          <div className="bg-magenta/10 border border-magenta/25 text-magentadeep p-3 rounded-xl text-xs flex items-start gap-2">
            <iconify-icon icon="ph:warning-circle-fill" width="16" height="16" style={{ marginTop: '1px', flexShrink: 0 } as any}></iconify-icon>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Public Case ID <span className="text-magenta">*</span>
            </label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value.toUpperCase())}
              placeholder="e.g. JS-K8M4N2P9"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm font-mono bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Secret Access Token <span className="text-magenta">*</span>
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your cryptographic access token"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 text-sm font-mono bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
            <p className="text-[11px] text-inkmute mt-1.5">
              Shown to you once upon intake submission.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full pill pill-ink justify-center px-6 py-3 text-sm font-medium disabled:opacity-50 mt-2"
          >
            {isLoading ? 'Verifying Access...' : 'Retrieve Case Information'}
            <iconify-icon icon="ph:arrow-right-bold" width="14" height="14"></iconify-icon>
          </button>
        </form>
      </div>

      {/* Security notice */}
      <div className="bg-creamdeep/60 border border-ink/8 rounded-2xl p-4 text-xs text-inkmute flex items-start gap-3">
        <iconify-icon icon="ph:shield-check-fill" width="18" height="18" style={{ color: '#d6246e', marginTop: '2px', flexShrink: 0 } as any}></iconify-icon>
        <p className="leading-relaxed">
          Case ID alone cannot reveal patient records. This dual-credential design protects your private health information without requiring password-based accounts.
        </p>
      </div>
    </div>
  );
};
