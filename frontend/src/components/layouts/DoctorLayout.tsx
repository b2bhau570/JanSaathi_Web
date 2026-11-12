import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { getUnreadNotificationCount } from '../../api/doctorApi';

const NAV_ITEMS = [
  { to: '/doctor/dashboard', label: 'Doctor Dashboard', icon: 'ph:chart-line-up-bold', end: true },
  { to: '/doctor/cases', label: 'Patient Checkup', icon: 'ph:stethoscope-bold', end: false },
  { to: '/shop', label: 'Medical Shop', icon: 'ph:shopping-bag-bold', end: false },
  { to: '/doctor/notifications', label: 'Priority Alerts', icon: 'ph:bell-ringing-bold', end: false, hasBadge: true },
  { to: '/doctor/profile', label: 'My Profile', icon: 'ph:user-circle-bold', end: false },
];

export const DoctorLayout: React.FC = () => {
  const { doctor, logout, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState({ unread: 0, emergencies: 0 });

  useEffect(() => {
    let isMounted = true;
    const fetchCounts = async () => {
      if (!isAuthenticated || !doctor || doctor.status !== 'approved') return;
      try {
        const counts = await getUnreadNotificationCount();
        if (isMounted) setUnreadCount(counts);
      } catch {
        // Silently skip if not authenticated yet
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 20000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, doctor]);

  // Auth & Status Gate
  if (!isLoading) {
    if (!isAuthenticated || !doctor) {
      navigate('/doctor/login', { replace: true });
      return null;
    }
    if (doctor.status === 'pending') {
      navigate('/doctor/pending-approval', { replace: true });
      return null;
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/doctor/login');
  };

  const allNavItems = [
    ...NAV_ITEMS,
    ...(doctor?.is_admin
      ? [{ to: '/admin', label: 'Admin Master Console', icon: 'ph:shield-check-bold', end: false }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-cream flex flex-col font-sans text-ink">
      {/* ── Sticky Clinical Header (editorial style) ── */}
      <header className="sticky top-0 z-50 bg-ink text-cream">
        <div className="max-w-[1240px] mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Mobile toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1 rounded hover:bg-cream/10 transition-colors"
              aria-label="Toggle navigation menu"
            >
              <iconify-icon
                icon={mobileMenuOpen ? 'ph:x-bold' : 'ph:list-bold'}
                width="18"
                height="18"
                style={{ color: '#faf6ef' }}
              ></iconify-icon>
            </button>

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-magenta flex items-center justify-center">
                <iconify-icon icon="ph:stethoscope-fill" width="14" height="14" style={{ color: '#faf6ef' }}></iconify-icon>
              </div>
              <span className="font-serif opsz-40 font-semibold text-cream tracking-tight text-sm">
                जन साथी AI{' '}
                <span className="text-cream/50 font-sans text-xs font-normal">| Clinical Workspace</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-4 text-xs">
            {unreadCount.emergencies > 0 && (
              <Link
                to="/doctor/cases?priority=emergency"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-magenta text-cream animate-pulse shadow-md"
                title="Immediate clinical emergency triage requires your attention"
              >
                <iconify-icon icon="ph:siren-fill" width="14" height="14"></iconify-icon>
                <span>{unreadCount.emergencies} Emergency</span>
              </Link>
            )}

            <div className="hidden sm:flex flex-col text-right">
              <span className="font-medium text-cream">{doctor?.full_name || 'Doctor'}</span>
              <span className="text-[11px] text-cream/55">
                {doctor?.is_admin ? 'Clinical Administrator' : 'Attending Physician'}
              </span>
            </div>

            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-magenta/20 text-magenta border border-magenta/30">
              Verified
            </span>

            <button
              onClick={handleLogout}
              className="pill pill-ghost px-3 py-1.5 text-xs border-cream/20"
              title="Sign out of clinical session"
            >
              <iconify-icon icon="ph:sign-out-bold" width="14" height="14"></iconify-icon>
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Body with Sidebar ── */}
      <div className="max-w-[1240px] mx-auto w-full flex-1 flex flex-col md:flex-row px-6 md:px-10 py-6 md:py-8 gap-6">
        {/* Sidebar Nav */}
        <nav
          className={`md:w-56 shrink-0 bg-creamdeep rounded-2xl border border-ink/8 p-3 self-start ${
            mobileMenuOpen ? 'block' : 'hidden md:block'
          }`}
          aria-label="Doctor Workspace Navigation"
        >
          <div className="eyebrow px-3 py-1 mb-2 text-[10px]">Clinical Tools</div>
          <ul className="space-y-1">
            {allNavItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-ink text-cream shadow-sm'
                        : 'text-inkmute hover:bg-ink/5 hover:text-ink'
                    }`
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <iconify-icon icon={item.icon} width="16" height="16"></iconify-icon>
                    <span>{item.label}</span>
                  </div>
                  {(item as any).hasBadge && unreadCount.unread > 0 && (
                    <span className="bg-magenta text-cream text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {unreadCount.unread}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="mt-6 pt-4 border-t border-ink/10 text-[11px] text-inkmute px-3 leading-relaxed">
            <div className="flex items-center gap-1 text-magenta font-semibold mb-1">
              <iconify-icon icon="ph:warning-circle-fill" width="12" height="12"></iconify-icon>
              Clinical Protocol
            </div>
            AI summaries and preliminary triage are advisory only. Final clinical assessment rests with licensed physicians.
          </div>
        </nav>

        {/* Content Outlet */}
        <section className="flex-1 min-w-0" aria-label="Clinical Content">
          <Outlet />
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-creamdeep border-t border-ink/10 py-4 text-center text-xs text-inkmute">
        Jan Saathi AI — Secure Clinical Management Session. Confidential patient data.
      </footer>
    </div>
  );
};
