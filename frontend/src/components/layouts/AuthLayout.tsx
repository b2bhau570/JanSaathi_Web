import React from 'react';
import { Link, Outlet } from 'react-router-dom';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center items-center p-6 font-sans text-ink">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group mb-3">
            <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center">
              <iconify-icon icon="ph:heartbeat-fill" width="18" height="18" style={{ color: '#faf6ef' }}></iconify-icon>
            </div>
            <span className="font-serif opsz-40 font-semibold text-ink tracking-tight text-lg">
              जन साथी <span className="text-inkmute font-light">AI</span>
            </span>
          </Link>
          <h2 className="text-sm text-inkmute mt-1">
            Authorized Healthcare Staff Authentication
          </h2>
        </div>

        {/* Form Container — editorial card */}
        <div className="bg-creamdeep rounded-2xl border border-ink/10 p-6 md:p-8 shadow-sm">
          <Outlet />
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs text-inkmute hover:text-magenta font-medium transition-colors"
          >
            <iconify-icon icon="ph:arrow-left-bold" width="12" height="12"></iconify-icon>
            Return to Public Patient Portal
          </Link>
        </div>

        {/* Security Notice */}
        <div className="text-center mt-4 text-[11px] text-inkmute/60">
          Unauthorized access to medical management systems is prohibited and logged.
        </div>
      </div>
    </div>
  );
};
