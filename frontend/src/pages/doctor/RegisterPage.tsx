import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerDoctor } from '../../api/doctorApi';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setError('You must accept the healthcare terms and clinical protocols.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await registerDoctor({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        registration_number: registrationNumber.trim() || undefined,
        issuing_authority: issuingAuthority.trim() || undefined,
        phone: phone.trim() || undefined,
      } as any);

      navigate('/doctor/pending-approval');
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail || 'Failed to submit registration. An account with this email may already exist.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif opsz-72 font-semibold text-xl text-ink">Doctor Registration</h1>
        <p className="text-xs text-inkmute mt-1">
          Apply for clinical access to the Jan Saathi AI physician network.
        </p>
      </div>

      <div className="bg-cream border border-ink/10 rounded-xl p-3 text-xs leading-relaxed text-inkmute">
        <strong className="text-ink">Verification Required:</strong> Newly registered clinician accounts start in <span className="text-magenta font-semibold">pending</span> status and must be verified by a medical director before accessing patient cases.
      </div>

      {error && (
        <div className="bg-magenta/10 border border-magenta/25 text-magentadeep p-3 rounded-xl text-xs flex items-start gap-2">
          <iconify-icon icon="ph:warning-circle-fill" width="16" height="16" style={{ marginTop: '1px', flexShrink: 0 } as any}></iconify-icon>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Full Name & Title <span className="text-magenta">*</span>
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Dr. Priya Sharma, MD"
            className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Official Email Address <span className="text-magenta">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya.sharma@hospital.org"
            className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Password <span className="text-magenta">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Confirm Password <span className="text-magenta">*</span>
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Medical Reg. Number
            </label>
            <input
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder="e.g. MCI-2018-98765"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Issuing Medical Council
            </label>
            <input
              type="text"
              value={issuingAuthority}
              onChange={(e) => setIssuingAuthority(e.target.value)}
              placeholder="e.g. Delhi Medical Council"
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Contact Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +91 9876543210"
            className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
          />
        </div>

        <div className="pt-1">
          <label className="flex items-start gap-2.5 text-xs text-inkmute cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="rounded border-ink/20 text-magenta focus:ring-magenta/30 mt-0.5"
            />
            <span>
              I certify that I am a licensed healthcare professional and agree to maintain patient confidentiality under applicable medical ethics guidelines.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full pill pill-ink justify-center px-6 py-3 text-sm font-medium disabled:opacity-50 mt-2"
        >
          {isLoading ? 'Submitting Registration...' : 'Submit Doctor Registration'}
          <iconify-icon icon="ph:arrow-right-bold" width="14" height="14"></iconify-icon>
        </button>
      </form>

      <div className="pt-4 border-t border-ink/10 text-center text-xs text-inkmute">
        Already registered?{' '}
        <Link to="/doctor/login" className="text-magenta font-semibold hover:underline">
          Sign In Here →
        </Link>
      </div>
    </div>
  );
};
