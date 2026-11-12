import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const ContactPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [contact, setContact] = useState('');
  const [category, setCategory] = useState('patient_help');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !contact.trim() || !message.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const ticketId = `JS-TICK-${Math.floor(10000 + Math.random() * 90000)}`;
      setSubmittedTicket(ticketId);
      setIsSubmitting(false);
      setFullName('');
      setContact('');
      setMessage('');
    }, 600);
  };

  return (
    <div className="min-h-screen bg-cream font-sans text-ink">
      <div className="max-w-[1100px] mx-auto px-6 py-12 sm:py-16 space-y-12">
        {/* Header */}
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="eyebrow text-magenta font-bold text-xs uppercase tracking-wider">
            Jan Saathi Support & Helplines (ସହାୟତା କେନ୍ଦ୍ର)
          </span>
          <h1 className="font-serif opsz-96 font-medium text-3xl sm:text-4xl text-ink tracking-tight">
            Contact Clinical Support
          </h1>
          <p className="text-xs sm:text-sm text-inkmute">
            Have questions about patient intake, hardware kiosks, or Jan Aushadhi medicine orders? We are here to help.
          </p>
        </div>

        {/* ── Emergency 24/7 Helplines ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-magenta/10 border border-magenta/25 rounded-3xl p-5 space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-magenta text-cream flex items-center justify-center mx-auto shadow-sm">
              <iconify-icon icon="ph:siren-fill" width="20" height="20"></iconify-icon>
            </div>
            <h3 className="font-serif opsz-72 text-base font-bold text-ink">Odisha Medical Emergency</h3>
            <p className="text-xs text-inkmute">Free 24x7 Government Ambulance</p>
            <a
              href="tel:108"
              className="inline-block font-mono text-xl font-extrabold text-magenta hover:underline"
            >
              Dial 108 / 112
            </a>
          </div>

          <div className="bg-creamdeep border border-ink/8 rounded-3xl p-5 space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-ink/8 text-ink flex items-center justify-center mx-auto">
              <iconify-icon icon="ph:phone-call-fill" width="20" height="20"></iconify-icon>
            </div>
            <h3 className="font-serif opsz-72 text-base font-bold text-ink">National Health Helpline</h3>
            <p className="text-xs text-inkmute">Toll-Free Health Advice</p>
            <a
              href="tel:104"
              className="inline-block font-mono text-xl font-extrabold text-ink hover:underline"
            >
              Dial 104
            </a>
          </div>

          <div className="bg-creamdeep border border-ink/8 rounded-3xl p-5 space-y-2 text-center">
            <div className="w-10 h-10 rounded-full bg-green-500/15 text-green-700 flex items-center justify-center mx-auto">
              <iconify-icon icon="ph:whatsapp-logo-fill" width="22" height="22"></iconify-icon>
            </div>
            <h3 className="font-serif opsz-72 text-base font-bold text-ink">24/7 WhatsApp AI Bot</h3>
            <p className="text-xs text-inkmute">Instant multilingual symptom guidance</p>
            <Link
              to="/assessment"
              className="inline-block text-xs font-bold text-green-700 hover:underline pt-1"
            >
              Start Live Chat →
            </Link>
          </div>
        </div>

        {/* ── Contact Form & Physical Info ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-7 bg-creamdeep rounded-3xl border border-ink/8 p-6 sm:p-8 space-y-5 shadow-sm">
            <div>
              <h2 className="font-serif opsz-72 text-xl font-bold text-ink">
                Send a Clinical Inquiry or Support Request
              </h2>
              <p className="text-xs text-inkmute mt-1">
                Our clinical coordination desk will review and respond within 4 hours.
              </p>
            </div>

            {submittedTicket ? (
              <div className="bg-green-500/10 border border-green-500/25 p-6 rounded-2xl text-center space-y-3 animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-green-600 text-cream flex items-center justify-center mx-auto text-xl font-bold shadow-md">
                  ✓
                </div>
                <h3 className="font-serif opsz-72 text-lg font-bold text-ink">
                  Inquiry Ticket Registered
                </h3>
                <p className="text-xs text-inkmute">
                  Your reference ticket: <strong className="font-mono text-ink">{submittedTicket}</strong>
                </p>
                <p className="text-[11px] text-inkmute">
                  A clinical coordinator has been notified on WhatsApp and will reach out shortly.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmittedTicket(null)}
                  className="pill pill-ink px-4 py-2 text-xs font-semibold"
                >
                  Submit Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Your Full Name <span className="text-magenta">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Ramesh Chandra Das"
                    className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 bg-cream text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-ink mb-1">
                      Phone Number / Email <span className="text-magenta">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 bg-cream text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-ink mb-1">Inquiry Topic:</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full border border-ink/14 rounded-xl px-3.5 py-2.5 bg-cream text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                    >
                      <option value="patient_help">Patient Intake & Prescription Help</option>
                      <option value="doctor_onboarding">Physician Registration & Approvals</option>
                      <option value="shop_orders">Jan Aushadhi Medicine Orders</option>
                      <option value="hardware_kiosk">ESP32 Hardware Kiosk Deployment</option>
                      <option value="general">Other / General Feedback</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-ink mb-1">
                    Your Message / Question <span className="text-magenta">*</span>
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Explain your medical inquiry, kiosk requirement, or feedback..."
                    className="w-full border border-ink/14 rounded-xl p-3 bg-cream text-ink text-xs focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full pill pill-ink py-3 text-xs font-bold"
                >
                  {isSubmitting ? 'Registering Ticket...' : 'Send Clinical Support Message'}
                </button>
              </form>
            )}
          </div>

          {/* Side Info */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-creamdeep rounded-3xl border border-ink/8 p-6 space-y-4 text-xs">
              <h3 className="font-serif opsz-72 text-base font-bold text-ink flex items-center gap-2">
                <iconify-icon icon="ph:map-pin-bold" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
                Clinic Network Headquarters
              </h3>
              <p className="text-inkmute leading-relaxed">
                <strong>Jan Saathi AI Clinical Coordination Hub</strong><br />
                Near District Headquarters Hospital (DHH),<br />
                Bhubaneswar, Odisha - 751001, India
              </p>

              <div className="border-t border-ink/8 pt-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-inkmute">Digital Intake:</span>
                  <strong className="text-green-700">24 Hours / 7 Days</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-inkmute">Tele-Doctor OPD:</span>
                  <span className="text-ink font-semibold">08:00 AM – 08:00 PM IST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-inkmute">Email:</span>
                  <span className="text-ink font-mono">support@jansaathi.gov.in</span>
                </div>
              </div>
            </div>

            <div className="bg-magenta/8 rounded-3xl border border-magenta/20 p-6 space-y-3 text-xs">
              <h3 className="font-bold text-magenta uppercase tracking-wider flex items-center gap-1.5">
                <iconify-icon icon="ph:shield-check-bold" width="16" height="16"></iconify-icon>
                Rural Health Kiosks
              </h3>
              <p className="text-ink leading-relaxed">
                Interested in installing an ESP32-S3 rural vitals kiosk at your local Gram Panchayat or Sub-Center? Contact our hardware deployment wing directly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

