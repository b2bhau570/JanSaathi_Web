import React from 'react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-6">
      <div className="w-16 h-16 rounded-full bg-creamdeep flex items-center justify-center">
        <iconify-icon icon="ph:compass-fill" width="28" height="28" style={{ color: '#5a544a' }}></iconify-icon>
      </div>
      <div className="space-y-2">
        <h1 className="font-serif opsz-96 font-medium text-3xl text-ink">404 — Lost in transit</h1>
        <p className="text-sm text-inkmute max-w-sm">
          The requested healthcare portal resource could not be found. Please check the URL or return to the main portal.
        </p>
      </div>
      <Link
        to="/"
        className="pill pill-ink px-6 py-3 text-sm"
      >
        <iconify-icon icon="ph:arrow-left-bold" width="14" height="14"></iconify-icon>
        Return to Patient Portal
      </Link>
    </div>
  );
};
