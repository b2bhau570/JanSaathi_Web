import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginDoctor } from '../../api/doctorApi';
import { useAuth } from '../../contexts/useAuth';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const authData = await loginDoctor({ email: email.trim(), password });
      login(authData);
      if (authData.doctor.status === 'pending') {
        navigate('/doctor/pending-approval');
      } else {
        navigate('/doctor/dashboard');
      }
    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      if (err.response?.status === 403 && typeof detail === 'string' && detail.toLowerCase().includes('pending')) {
        navigate('/doctor/pending-approval');
      } else {
        setError(detail || 'Invalid email or password. Please verify your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif opsz-72 font-semibold text-xl text-ink">Doctor Login</h1>
        <p className="text-xs text-inkmute mt-1">
          Access the Jan Saathi AI clinical case management dashboard.
        </p>
      </div>

      {error && (
        <div className="bg-magenta/10 border border-magenta/25 text-magentadeep p-3 rounded-xl text-xs flex items-start gap-2">
          <iconify-icon icon="ph:warning-circle-fill" width="16" height="16" style={{ marginTop: '1px', flexShrink: 0 } as any}></iconify-icon>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Registered Email Address
          </label>
          <div className="relative">
            <iconify-icon icon="ph:envelope-simple-fill" width="16" height="16" style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '12px' } as any}></iconify-icon>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="doctor@hospital.org"
              className="w-full border border-ink/14 rounded-xl pl-9 pr-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Password
          </label>
          <div className="relative">
            <iconify-icon icon="ph:lock-simple-fill" width="16" height="16" style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '12px' } as any}></iconify-icon>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-ink/14 rounded-xl pl-9 pr-3.5 py-2.5 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full pill pill-ink justify-center px-6 py-3 text-sm font-medium disabled:opacity-50"
        >
          {isLoading ? 'Verifying Credentials...' : 'Sign In to Clinical Workspace'}
          <iconify-icon icon="ph:arrow-right-bold" width="14" height="14"></iconify-icon>
        </button>
      </form>

      <div className="pt-4 border-t border-ink/10 text-center text-xs text-inkmute">
        New clinician?{' '}
        <Link to="/doctor/register" className="text-magenta font-semibold hover:underline">
          Register Doctor Account →
        </Link>
      </div>
    </div>
  );
};
