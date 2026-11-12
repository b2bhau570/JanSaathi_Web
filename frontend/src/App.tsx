import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import { PatientLayout } from './components/layouts/PatientLayout';
import { DoctorLayout } from './components/layouts/DoctorLayout';
import { AuthLayout } from './components/layouts/AuthLayout';
import { HomePage } from './pages/patient/HomePage';

function lazyNamed<K extends string>(
  loader: () => Promise<{ [P in K]: React.ComponentType<any> }>,
  exportName: K,
) {
  return lazy(() => loader().then((mod) => ({ default: mod[exportName] })));
}

// ── Lazy-loaded Platform Pages (route-level code splitting) ──
const LanguageSelectionPage = lazyNamed(() => import('./pages/patient/LanguageSelectionPage'), 'LanguageSelectionPage');
const ModeSelectionPage = lazyNamed(() => import('./pages/patient/ModeSelectionPage'), 'ModeSelectionPage');
const AssessmentPage = lazyNamed(() => import('./pages/patient/AssessmentPage'), 'AssessmentPage');
const AssessmentCompletePage = lazyNamed(() => import('./pages/patient/AssessmentCompletePage'), 'AssessmentCompletePage');
const TrackCasePage = lazyNamed(() => import('./pages/patient/TrackCasePage'), 'TrackCasePage');
const DashboardPage = lazyNamed(() => import('./pages/doctor/DashboardPage'), 'DashboardPage');
const CaseDetailPage = lazyNamed(() => import('./pages/doctor/CaseDetailPage'), 'CaseDetailPage');
const CaseQueuePage = lazyNamed(() => import('./pages/doctor/CaseQueuePage'), 'CaseQueuePage');
const MedicalShopPage = lazyNamed(() => import('./pages/patient/MedicalShopPage'), 'MedicalShopPage');
const MedicineOrderPage = lazyNamed(() => import('./pages/patient/MedicineOrderPage'), 'MedicineOrderPage');
const WhatsAppBotPage = lazyNamed(() => import('./pages/patient/WhatsAppBotPage'), 'WhatsAppBotPage');
const CaseAccessPage = lazyNamed(() => import('./pages/patient/CaseAccessPage'), 'CaseAccessPage');
const CaseViewPage = lazyNamed(() => import('./pages/patient/CaseViewPage'), 'CaseViewPage');
const AboutPage = lazyNamed(() => import('./pages/public/AboutPage'), 'AboutPage');
const TermsPage = lazyNamed(() => import('./pages/public/TermsPage'), 'TermsPage');
const ContactPage = lazyNamed(() => import('./pages/public/ContactPage'), 'ContactPage');
const AdminPage = lazyNamed(() => import('./pages/doctor/AdminPage'), 'AdminPage');
const LoginPage = lazyNamed(() => import('./pages/doctor/LoginPage'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./pages/doctor/RegisterPage'), 'RegisterPage');
const PendingApprovalPage = lazyNamed(() => import('./pages/doctor/PendingApprovalPage'), 'PendingApprovalPage');
const NotificationsPage = lazyNamed(() => import('./pages/doctor/NotificationsPage'), 'NotificationsPage');
const ProfilePage = lazyNamed(() => import('./pages/doctor/ProfilePage'), 'ProfilePage');
const NotFoundPage = lazyNamed(() => import('./pages/NotFoundPage'), 'NotFoundPage');

const RouteFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center text-sm text-[#6b5e50]">
    Loading...
  </div>
);

export const App: React.FC = () => {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      {/* ── Public & Patient Pages (Clean Editorial Layout) ── */}
      <Route element={<PatientLayout />}>
        {/* 1. Landing Page */}
        <Route index element={<HomePage />} />
        <Route path="patient" element={<Navigate to="/patient/language" replace />} />
        <Route path="patient/language" element={<LanguageSelectionPage />} />
        <Route path="select-language" element={<LanguageSelectionPage />} />
        <Route path="patient/mode" element={<ModeSelectionPage />} />
        <Route path="mode" element={<ModeSelectionPage />} />

        {/* 2. Patient Assessment Page */}
        <Route path="assessment" element={<AssessmentPage />} />
        <Route path="assessment/complete" element={<AssessmentCompletePage />} />
        <Route path="patient/assessment" element={<AssessmentPage />} />
        <Route path="patient/assessment/complete" element={<AssessmentCompletePage />} />

        {/* 3. Track Case Page */}
        <Route path="track" element={<TrackCasePage />} />
        <Route path="track/:caseId" element={<TrackCasePage />} />
        <Route path="track-case" element={<TrackCasePage />} />
        <Route path="case/:caseId" element={<TrackCasePage />} />
        <Route path="patient/case/:caseId" element={<TrackCasePage />} />
        <Route path="patient/case-access" element={<CaseAccessPage />} />
        <Route path="case-access" element={<CaseAccessPage />} />
        <Route path="patient/case-view/:caseId" element={<CaseViewPage />} />

        {/* WhatsApp Clinical Assistant */}
        <Route path="whatsapp-bot/:caseId" element={<WhatsAppBotPage />} />
        <Route path="patient/whatsapp-bot/:caseId" element={<WhatsAppBotPage />} />

        {/* 6. Medical Shop & Prescriptions */}
        <Route path="shop" element={<MedicalShopPage />} />
        <Route path="medical-shop" element={<MedicalShopPage />} />
        <Route path="medicines" element={<MedicalShopPage />} />
        <Route path="patient/orders/:caseId" element={<MedicineOrderPage />} />
        <Route path="orders/:caseId" element={<MedicineOrderPage />} />

        {/* 7. About Page */}
        <Route path="about" element={<AboutPage />} />

        {/* 8. Terms and Condition Page */}
        <Route path="terms" element={<TermsPage />} />
        <Route path="terms-and-conditions" element={<TermsPage />} />

        {/* 9. Contact Page */}
        <Route path="contact" element={<ContactPage />} />
      </Route>

      {/* ── Doctor & Admin Authentication ── */}
      <Route element={<AuthLayout />}>
        <Route path="doctor/login" element={<LoginPage />} />
        <Route path="doctor/register" element={<RegisterPage />} />
        <Route path="doctor/pending-approval" element={<PendingApprovalPage />} />
      </Route>

      {/* ── Doctor Clinical Workspace & Admin Console (Protected) ── */}
      <Route element={<DoctorLayout />}>
        <Route path="doctor" element={<Navigate to="/doctor/dashboard" replace />} />

        {/* 4. Doctor Dashboard */}
        <Route path="doctor/dashboard" element={<DashboardPage />} />

        {/* 5. Doctor Patient Checkup Page & Queue */}
        <Route path="doctor/cases" element={<CaseQueuePage />} />
        <Route path="doctor/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="doctor/checkup/:caseId" element={<CaseDetailPage />} />

        {/* 10. Admin Page (Master Platform Controls) */}
        <Route path="admin" element={<AdminPage />} />
        <Route path="doctor/admin" element={<AdminPage />} />

        {/* Auxiliary Doctor Clinical Screens */}
        <Route path="doctor/notifications" element={<NotificationsPage />} />
        <Route path="doctor/profile" element={<ProfilePage />} />
      </Route>

      {/* ── 404 Fallback ── */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
};

export default App;
