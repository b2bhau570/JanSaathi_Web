import React from 'react';
import { Link } from 'react-router-dom';

export const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      {/* ── Hero Section ── */}
      <section className="border-b border-ink/8 py-16 sm:py-24 bg-creamdeep/60">
        <div className="max-w-[1000px] mx-auto px-6 text-center space-y-4">
          <span className="eyebrow text-magenta font-bold text-xs uppercase tracking-wider">
            Jan Saathi AI • Health Equity for Bharat
          </span>
          <h1 className="font-serif opsz-96 font-medium text-4xl sm:text-5xl md:text-6xl text-ink tracking-tight">
            Democratizing Clinical Care Across Rural Odisha & India
          </h1>
          <p className="text-sm sm:text-base text-inkmute max-w-2xl mx-auto leading-relaxed">
            A local-first healthcare intake, preliminary triage, and tele-doctor assistance platform designed to empower Primary Health Centers (PHCs) and rural communities.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link to="/assessment" className="pill pill-ink px-6 py-2.5 text-xs font-bold">
              Start Patient Intake
            </Link>
            <Link to="/shop" className="pill pill-secondary px-6 py-2.5 text-xs font-bold">
              Visit Jan Aushadhi Store
            </Link>
          </div>
        </div>
      </section>

      {/* ── Core Mission & Vision ── */}
      <section className="max-w-[1100px] mx-auto px-6 py-16 space-y-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-magenta">The Challenge</span>
            <h2 className="font-serif opsz-72 text-2xl sm:text-3xl font-semibold text-ink leading-tight">
              Bridging the Doctor-to-Patient Divide in Underserved Districts
            </h2>
            <p className="text-xs sm:text-sm text-inkmute leading-relaxed">
              In rural Odisha and across Indian villages, the patient-to-physician ratio often exceeds 1:11,000. Patients travel hours across unpaved roads to reach sub-centers, only to find long queues, language barriers in reporting symptoms, and expensive branded medications.
            </p>
            <p className="text-xs sm:text-sm text-inkmute leading-relaxed">
              Jan Saathi AI was born to bridge this exact gap: allowing villagers to articulate symptoms in their native mother tongue (Odia & Hindi), capturing vital signs via IoT kiosks, and presenting structured summaries to visiting or tele-physicians.
            </p>
          </div>

          <div className="bg-creamdeep rounded-3xl border border-ink/8 p-8 space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-magenta text-cream flex items-center justify-center">
              <iconify-icon icon="ph:first-aid-kit-fill" width="24" height="24"></iconify-icon>
            </div>
            <h3 className="font-serif opsz-72 text-xl font-bold text-ink">
              Our Clinical Manifesto
            </h3>
            <ul className="space-y-3 text-xs text-inkmute leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-magenta font-bold">✓</span>
                <span><strong>No Account Needed for Patients:</strong> Friction-free access ensures illiterate or elderly citizens can consult without passwords.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-magenta font-bold">✓</span>
                <span><strong>Native Language Audio Intake:</strong> Natural speech conversation in Odia (ଓଡ଼ିଆ) and Hindi empowers rural voices.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-magenta font-bold">✓</span>
                <span><strong>70-85% Subsidized Formulations:</strong> Deep alignment with Pradhan Mantri Bharatiya Janaushadhi Pariyojana (PMBJP).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-magenta font-bold">✓</span>
                <span><strong>Doctor-in-the-Loop Safety:</strong> AI advises and translates; human doctors retain exclusive authority to diagnose and prescribe.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Three Pillars of Technology ── */}
        <div className="space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-magenta">Architecture</span>
            <h2 className="font-serif opsz-96 text-2xl sm:text-3xl font-semibold text-ink">
              Three Pillars of Jan Saathi
            </h2>
            <p className="text-xs text-inkmute">Designed specifically for the realities of Indian rural healthcare</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-ink/8 text-ink flex items-center justify-center">
                <iconify-icon icon="ph:translate-bold" width="20" height="20"></iconify-icon>
              </div>
              <h3 className="font-serif opsz-72 text-base font-bold text-ink">1. Multilingual Audio AI</h3>
              <p className="text-xs text-inkmute leading-relaxed">
                Adaptive speech-to-text models fluent in regional Odia dialects and Hindi translate colloquial patient complaints into standardized clinical SOAP terminology for physicians.
              </p>
            </div>

            <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-magenta/15 text-magenta flex items-center justify-center">
                <iconify-icon icon="ph:cpu-bold" width="20" height="20"></iconify-icon>
              </div>
              <h3 className="font-serif opsz-72 text-base font-bold text-ink">2. ESP32-S3 Health Kiosk</h3>
              <p className="text-xs text-inkmute leading-relaxed">
                Custom low-cost hardware station capturing pulse oximetry (MAX30102), body temperature (DS18B20), and vitals over local WiFi / serial without requiring high-speed broadband.
              </p>
            </div>

            <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/15 text-green-700 flex items-center justify-center">
                <iconify-icon icon="ph:pill-bold" width="20" height="20"></iconify-icon>
              </div>
              <h3 className="font-serif opsz-72 text-base font-bold text-ink">3. Jan Aushadhi Integration</h3>
              <p className="text-xs text-inkmute leading-relaxed">
                Direct linkage with government Janaushadhi Kendras ensures prescribed generic formulations are instantly priced and dispatched with massive savings for rural households.
              </p>
            </div>
          </div>
        </div>

        {/* ── Clinical Safety Notice ── */}
        <div className="bg-creamdeep rounded-3xl border border-ink/10 p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-magenta/15 text-magenta flex items-center justify-center mx-auto">
            <iconify-icon icon="ph:shield-check-bold" width="20" height="20"></iconify-icon>
          </div>
          <h3 className="font-serif opsz-72 text-lg font-bold text-ink">
            Clinical Safety & Governance
          </h3>
          <p className="text-xs text-inkmute max-w-xl mx-auto leading-relaxed">
            Jan Saathi AI operates in strict accordance with the Telemedicine Practice Guidelines issued by the National Medical Commission (NMC) and the Digital Personal Data Protection Act of India.
          </p>
        </div>
      </section>
    </div>
  );
};

