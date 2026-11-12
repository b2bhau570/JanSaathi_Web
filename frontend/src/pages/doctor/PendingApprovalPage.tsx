import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';

export const PendingApprovalPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout, doctor } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate('/doctor/login');
  };

  return (
    <div className="space-y-6 text-center">
      <div className="w-14 h-14 bg-magenta/10 text-magenta rounded-full flex items-center justify-center mx-auto">
        <iconify-icon icon="ph:clock-countdown-fill" width="28" height="28"></iconify-icon>
      </div>

      <div className="space-y-2">
        <h1 className="font-serif opsz-72 font-semibold text-xl text-ink">
          Account Pending Administrator Approval
        </h1>
        <p className="text-xs text-inkmute max-w-sm mx-auto leading-relaxed">
          Your physician account has been registered successfully. For patient data privacy, newly registered clinicians must be approved by an administrator before accessing patient cases.
        </p>
      </div>

      {doctor && (
        <div className="bg-cream border border-ink/10 rounded-xl p-4 text-xs text-left text-ink space-y-1.5">
          <div>
            <span className="text-inkmute">Name:</span> <strong>{doctor.full_name}</strong>
          </div>
          <div>
            <span className="text-inkmute">Email:</span> {doctor.email}
          </div>
          <div>
            <span className="text-inkmute">Status:</span>{' '}
            <span className="text-magenta font-semibold uppercase">{doctor.status}</span>
          </div>
        </div>
      )}

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="w-full sm:w-auto pill pill-ink px-5 py-2.5 text-xs font-medium justify-center"
        >
          <iconify-icon icon="ph:arrows-clockwise-bold" width="14" height="14"></iconify-icon>
          <span>Check Approval Status</span>
        </button>

        <button
          onClick={handleSignOut}
          className="w-full sm:w-auto pill pill-secondary px-5 py-2.5 text-xs font-medium justify-center"
        >
          <span>Sign Out</span>
        </button>
      </div>

      <div className="pt-4 border-t border-ink/10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-inkmute hover:text-magenta transition-colors"
        >
          <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
          Return to Public Portal
        </Link>
      </div>
    </div>
  );
};
