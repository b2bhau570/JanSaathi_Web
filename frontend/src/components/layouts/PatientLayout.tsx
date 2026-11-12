import React, { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';

const CURRENT_YEAR = new Date().getFullYear();

const MAIN_NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/patient/language', label: 'Patient Portal' },
  { to: '/track', label: 'Track Case' },
  { to: '/shop', label: 'Medical Shop' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export const PatientLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex flex-col font-sans text-ink">
      {/* ── Emergency Warning Banner ── */}
      <aside
        aria-label="Emergency Notice"
        className="bg-magenta text-cream px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
      >
        <iconify-icon icon="ph:warning-fill" width="16" height="16"></iconify-icon>
        <span>
          <strong>Emergency Warning:</strong> If you are experiencing severe chest pain, breathlessness, loss of consciousness, or profuse bleeding, call{' '}
          <strong>112 / 108</strong> immediately.
        </span>
      </aside>

      {/* ── Sticky Blurred Editorial Nav ── */}
      <header className="sticky top-0 z-50 bg-cream/90 backdrop-blur-xl border-b border-ink/10">
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 h-[68px] flex items-center justify-between">
          {/* Left: circular ink badge with heartbeat + Jan Saathi AI wordmark */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-full bg-ink flex items-center justify-center shrink-0 group-hover:bg-magenta transition-colors shadow-xs">
              <iconify-icon icon="ph:heartbeat-fill" width="18" height="18" style={{ color: '#faf6ef' }}></iconify-icon>
            </div>
            <span className="font-serif opsz-40 font-semibold text-ink tracking-tight text-lg">
              Jan Saathi AI <span className="font-sans font-light text-inkmute text-xs tracking-normal">| ଜନ ସାଥୀ</span>
            </span>
          </Link>

          {/* Center: Main navigation links */}
          <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
            {MAIN_NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-xs font-semibold text-inkmute hover:text-magenta transition-colors duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: Quick CTA & Doctor Access */}
          <div className="flex items-center gap-2.5">
            <Link
              to="/doctor/dashboard"
              className="hidden sm:inline-flex pill pill-secondary px-3.5 py-1.5 text-xs font-semibold"
              title="Clinical Doctor & Administrator Workspace"
            >
              <iconify-icon icon="ph:stethoscope-bold" width="13" height="13"></iconify-icon>
              <span>Doctor Portal</span>
            </Link>

            <Link
              to="/patient/language"
              className="pill pill-ink px-4 py-2 text-xs font-bold transition-colors duration-300 shadow-xs hover:bg-magenta"
            >
              Go to Patient Portal
            </Link>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-creamdeep transition-colors"
              aria-label="Toggle navigation menu"
            >
              <iconify-icon
                icon={mobileMenuOpen ? 'ph:x-bold' : 'ph:list-bold'}
                width="20"
                height="20"
              ></iconify-icon>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-cream/95 backdrop-blur-xl border-t border-ink/10 px-6 py-4 space-y-2 text-xs font-semibold">
            {MAIN_NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-ink border-b border-ink/8 last:border-0 hover:text-magenta"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/terms"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-inkmute border-b border-ink/8 hover:text-magenta"
            >
              Terms & Conditions
            </Link>
            <Link
              to="/doctor/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-magenta font-bold hover:underline"
            >
              Doctor & Admin Workspace →
            </Link>
          </div>
        )}
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-[1240px] w-full mx-auto px-6 md:px-10 py-8 md:py-12">
        <Outlet />
      </main>

      {/* ══════════════════════════════════════════════════
          DARK INK GUINEX HEALTHCARE FOOTER
          ══════════════════════════════════════════════════ */}
      <footer className="bg-ink text-cream mt-auto border-t border-ink/20">
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 py-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
            {/* Col-span-5 Brand Block */}
            <div className="md:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-magenta flex items-center justify-center shrink-0">
                  <iconify-icon icon="ph:heartbeat-fill" width="16" height="16" style={{ color: '#faf6ef' }}></iconify-icon>
                </div>
                <span className="font-serif opsz-40 font-semibold text-cream tracking-tight text-lg">
                  Guinex <span className="font-light text-cream/55 text-sm">| Jan Saathi AI</span>
                </span>
              </div>
              <p className="font-serif italic text-cream/65 opsz-72 max-w-[24ch] text-lg leading-snug">
                Dignified, voice-enabled healthcare intake and clinical triage.
              </p>
              <p className="text-xs text-cream/45 max-w-[38ch] leading-relaxed">
                Guinex Healthcare Intelligence — local-first public hospital intake, multilingual dialect processing, and physician case queueing with zero patient accounts.
              </p>
            </div>

            {/* Three Healthcare Columns: Patients, Clinicians, Platform */}
            <div className="md:col-span-2 space-y-4">
              <h4 className="uppercase text-[11px] tracking-[0.28em] font-semibold text-cream/40">
                Patient Services
              </h4>
              <div className="space-y-2.5">
                <Link to="/assessment" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Patient Assessment
                </Link>
                <Link to="/track" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Track Case & Rx
                </Link>
                <Link to="/shop" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Medical Shop (PMBJP)
                </Link>
                <a href="tel:108" className="block text-sm text-magenta font-semibold hover:underline">
                  Emergency: 108
                </a>
              </div>
            </div>

            <div className="md:col-span-2 space-y-4">
              <h4 className="uppercase text-[11px] tracking-[0.28em] font-semibold text-cream/40">
                About & Help
              </h4>
              <div className="space-y-2.5">
                <Link to="/about" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  About Jan Saathi
                </Link>
                <Link to="/terms" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Terms & Conditions
                </Link>
                <Link to="/contact" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Contact & Support
                </Link>
              </div>
            </div>

            <div className="md:col-span-3 space-y-4">
              <h4 className="uppercase text-[11px] tracking-[0.28em] font-semibold text-cream/40">
                Clinicians & Admin
              </h4>
              <div className="space-y-2.5">
                <Link to="/doctor/dashboard" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Doctor Dashboard
                </Link>
                <Link to="/doctor/cases" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Doctor Checkup Workstation
                </Link>
                <Link to="/admin" className="block text-sm text-cream/75 hover:text-magenta transition-colors">
                  Admin Master Console
                </Link>
                <Link to="/doctor/login" className="block text-sm text-cream/50 hover:text-cream transition-colors text-xs">
                  Physician Sign In
                </Link>
              </div>
            </div>
          </div>

          {/* Top-bordered bottom bar */}
          <div className="mt-12 pt-6 border-t border-cream/12 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs text-cream/45">
              © {CURRENT_YEAR} Jan Saathi AI • Pradhan Mantri Bharatiya Janaushadhi Pariyojana Partner.
            </span>
            <div className="flex items-center gap-5 text-xs text-cream/45">
              <Link to="/terms" className="hover:text-cream/70 transition-colors">Patient Privacy & Terms</Link>
              <Link to="/contact" className="hover:text-cream/70 transition-colors">Support Desk</Link>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream/8 border border-cream/12 text-cream/80 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-magenta animate-pulse"></span>
                <span>Active Clinical Hub</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
