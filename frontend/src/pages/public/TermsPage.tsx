import React from 'react';
import { Link } from 'react-router-dom';

export const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      <div className="max-w-[900px] mx-auto px-6 py-12 sm:py-16 space-y-8">
        {/* Header */}
        <div className="border-b border-ink/8 pb-6 space-y-2">
          <span className="eyebrow text-magenta font-bold text-xs uppercase tracking-wider">
            Clinical Governance & Legal Framework
          </span>
          <h1 className="font-serif opsz-96 font-medium text-3xl sm:text-4xl text-ink">
            Terms of Service & Clinical Conditions
          </h1>
          <p className="text-xs text-inkmute">
            Last Updated: November 2026 • In alignment with Telemedicine Practice Guidelines (NMC India)
          </p>
        </div>

        {/* Emergency Notice */}
        <div className="bg-magenta/10 border-l-4 border-magenta border-y border-r border-magenta/25 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-magenta font-bold text-xs uppercase tracking-wide">
            <iconify-icon icon="ph:warning-circle-fill" width="16" height="16"></iconify-icon>
            <span>Emergency Medical Disclaimer</span>
          </div>
          <p className="text-xs text-ink leading-relaxed">
            Jan Saathi AI is a clinical intake, preliminary triage assistance, and tele-physician coordination platform. It is <strong>NOT an emergency response system</strong> and does not provide automated life support. If you or a family member are experiencing acute chest pain, severe breathlessness, head trauma, profuse bleeding, or acute poisoning, immediately call <strong>112 / 108</strong> or proceed to the nearest casualty emergency department.
          </p>
        </div>

        {/* Terms Sections */}
        <div className="space-y-6 text-xs sm:text-sm text-inkmute leading-relaxed">
          <section className="bg-creamdeep p-6 rounded-3xl border border-ink/8 space-y-2.5">
            <h2 className="font-serif opsz-72 text-base font-bold text-ink">
              1. Nature of the Service & Patient Consent
            </h2>
            <p>
              By accessing the Jan Saathi AI public intake portal, you consent to submitting your medical symptoms, demographic details, and optional documents for preliminary organizational sorting and physician review. You acknowledge that AI preliminary triage outputs are advisory screening tools meant to assist human doctors in prioritizing care.
            </p>
          </section>

          <section className="bg-creamdeep p-6 rounded-3xl border border-ink/8 space-y-2.5">
            <h2 className="font-serif opsz-72 text-base font-bold text-ink">
              2. Physician Independence & Prescriptions
            </h2>
            <p>
              All final clinical assessments, diagnoses, dispositions, and prescriptions issued through Jan Saathi AI are formulated exclusively by certified, registered medical practitioners (Doctors) holding valid licenses with their respective State Medical Councils or the National Medical Commission.
            </p>
            <p>
              The platform itself does not practice medicine. Prescriptions generated on Jan Saathi AI follow standard generic guidelines compliant with Indian pharmaceutical regulations.
            </p>
          </section>

          <section className="bg-creamdeep p-6 rounded-3xl border border-ink/8 space-y-2.5">
            <h2 className="font-serif opsz-72 text-base font-bold text-ink">
              3. Jan Aushadhi Medical Store & Subsidy Guidelines
            </h2>
            <p>
              Medicines listed in the Medical Shop are procured and priced under the Pradhan Mantri Bharatiya Janaushadhi Pariyojana (PMBJP) or authorized pharmaceutical PSUs.
            </p>
            <p>
              Schedule H and H1 prescription drugs require validation by an attending physician via a verified Case ID. Over-the-counter (OTC) products, first aid supplies, and diagnostic health devices (Pulse Oximeters, Thermometers, BP Monitors) may be purchased directly subject to stock availability at regional fulfillment hubs.
            </p>
          </section>

          <section className="bg-creamdeep p-6 rounded-3xl border border-ink/8 space-y-2.5">
            <h2 className="font-serif opsz-72 text-base font-bold text-ink">
              4. Data Privacy, Storage & DPDP Compliance
            </h2>
            <p>
              Jan Saathi AI upholds the core principles of India's Digital Personal Data Protection (DPDP) Act:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li>No public passwords: Cases are protected by SHA-256 hashed cryptographic access tokens.</li>
              <li>Local-first data governance: Information is maintained within approved clinic databases without third-party ad tracking or commercial monetization.</li>
              <li>Confidentiality: Medical records and doctor notes are restricted strictly to the treating clinician and verified patient token holders.</li>
            </ul>
          </section>

          <section className="bg-creamdeep p-6 rounded-3xl border border-ink/8 space-y-2.5">
            <h2 className="font-serif opsz-72 text-base font-bold text-ink">
              5. Contact & Grievance Redressal
            </h2>
            <p>
              For grievances, clinical protocol inquiries, or technical support regarding hospital hardware kiosks, please visit our <Link to="/contact" className="text-magenta font-semibold hover:underline">Contact Page</Link> or reach the grievance nodal officer at support@jansaathi.gov.in.
            </p>
          </section>
        </div>

        <div className="pt-6 border-t border-ink/8 flex items-center justify-between text-xs">
          <Link to="/" className="pill pill-ink px-4 py-2 font-semibold">
            ← Return to Home
          </Link>
          <span className="text-inkmute">
            Jan Saathi AI Healthcare Initiative
          </span>
        </div>
      </div>
    </div>
  );
};

