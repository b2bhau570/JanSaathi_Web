import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';
import type { SupportedLanguage } from '../../i18n/translations';

export const HomePage: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  ];

  return (
    <div className="space-y-24 md:space-y-32">
      {/* ══════════════════════════════════════════════════
          1. HEALTHCARE MANIFESTO HERO
          ══════════════════════════════════════════════════ */}
      <section id="hero" className="pt-8 md:pt-16 scroll-mt-24">
        {/* Eyebrow rule row */}
        <div className="flex items-center gap-4 mb-8 md:mb-12">
          <span className="eyebrow">Guinex Healthcare Manifesto</span>
          <div className="flex-1 border-t border-ink/14"></div>
          <span className="text-xs text-inkmute tracking-wide">Est. 2024 • Ayushman Bharat Aligned</span>
        </div>

        {/* Huge Fraunces display headline */}
        <h1 className="font-serif opsz-144 font-medium text-display max-w-[15ch] mb-8 leading-[0.95] tracking-[-0.022em]">
          Dignified healthcare{' '}
          <span className="italic font-light text-magenta">intake</span>
          {' '}before you meet the doctor.
        </h1>

        {/* Lede paragraph */}
        <p className="text-inkmute font-light text-[17px] md:text-[19px] max-w-[48ch] leading-relaxed mb-10">
          Jan Saathi AI by Guinex transforms spoken patient concerns in any Indian mother tongue into organized clinical cases, triage severity scores, and physician notes in seconds. Zero accounts or passwords required.
        </p>

        {/* CTA row */}
        <div className="flex flex-wrap items-center gap-3.5">
          <Link
            to="/patient/language"
            className="pill pill-magenta px-7 py-4 text-base font-bold inline-flex items-center gap-2.5 group shadow-md hover:scale-[1.02] transition-transform"
          >
            <iconify-icon icon="ph:user-circle-bold" width="20" height="20"></iconify-icon>
            <span>Go to Patient Portal • ରୋଗୀ ପୋର୍ଟାଲ୍</span>
            <iconify-icon icon="ph:arrow-right-bold" width="16" height="16" className="group-hover:translate-x-1 transition-transform"></iconify-icon>
          </Link>

          <Link
            to="/track"
            className="pill pill-secondary px-5 py-3.5 text-sm font-semibold inline-flex items-center gap-2"
          >
            <iconify-icon icon="ph:clipboard-text-bold" width="16" height="16"></iconify-icon>
            <span>Track Case</span>
          </Link>

          <Link
            to="/shop"
            className="pill pill-secondary px-5 py-3.5 text-sm font-semibold inline-flex items-center gap-2"
          >
            <iconify-icon icon="ph:shopping-bag-bold" width="16" height="16"></iconify-icon>
            <span>Medical Shop (70% Off)</span>
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          2. FULL-BLEED GRADIENT STRIP
          ══════════════════════════════════════════════════ */}
      <section className="relative rounded-[20px] h-[260px] md:h-[440px] overflow-hidden shadow-sm">
        {/* Layered radial + 118deg linear gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse at 20% 20%, rgba(214,36,110,0.4) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 80%, rgba(22,19,15,0.55) 0%, transparent 60%),
              linear-gradient(118deg, #f3ecdf 0%, #f0c7d9 30%, #d6246e 60%, #16130f 100%)
            `,
          }}
        ></div>

        {/* Faint cream grid texture overlay (54px cells at ~16% opacity) */}
        <div className="absolute inset-0 grid-texture-cream opacity-16"></div>

        {/* Caption & Glass Sparkle Badge */}
        <div className="absolute bottom-6 md:bottom-10 left-6 md:left-10 right-6 md:right-10 flex items-end justify-between">
          <p className="font-serif italic text-cream opsz-72 text-caption-lg max-w-[20ch] leading-snug drop-shadow-sm">
            A patient's voice, heard with dignity. Before distress escalates.
          </p>
          <div className="hidden md:flex w-14 h-14 rounded-full bg-cream/15 backdrop-blur-md border border-cream/30 items-center justify-center shadow-lg">
            <iconify-icon icon="ph:heartbeat-fill" width="22" height="22" style={{ color: '#faf6ef' }}></iconify-icon>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          3. 'WHY GUINEX EXISTS' 12-COL EDITORIAL BLOCK
          ══════════════════════════════════════════════════ */}
      <section id="triage" className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 scroll-mt-24">
        {/* Left 4 cols: Eyebrow + Heading */}
        <div className="md:col-span-4 space-y-4">
          <span className="eyebrow block">Clinical Purpose</span>
          <h2 className="font-serif opsz-96 font-medium text-display-sm leading-[1.08] tracking-[-0.02em]">
            The gap between{' '}
            <span className="italic font-light text-magenta">symptom</span>
            {' '}and the first clinical consult.
          </h2>
        </div>

        {/* Right 7 cols (col-start-6): Body + Feature pair */}
        <div className="md:col-span-7 md:col-start-6 space-y-8">
          <p className="text-ink font-light text-[18px] md:text-[21px] leading-relaxed">
            In busy district hospitals, community health centers, and village kiosks, patients spend hours waiting before a healthcare worker hears their story. Jan Saathi AI by Guinex bridges that critical window.
          </p>
          <p className="text-inkmute text-sm md:text-base leading-relaxed">
            Patients speak freely in their native Indian dialects—Odia, Hindi, Bengali, Telugu, and more. Our platform extracts clinical entities, streams live vital signs from hardware sensors, and prepares structured SOAP documentation for licensed attending doctors.
          </p>

          {/* 2-up feature pair with magenta Phosphor icons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-ink/10">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-magenta">
                <iconify-icon icon="ph:microphone-stage-fill" width="18" height="18"></iconify-icon>
                <h4 className="font-serif opsz-72 font-semibold text-[18px] text-ink">
                  Dialect to Clinical SOAP
                </h4>
              </div>
              <p className="text-xs text-inkmute leading-relaxed">
                Raw mother tongue audio converts into standardized clinical symptoms, timeline, and preliminary severity notes in seconds.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-magenta">
                <iconify-icon icon="ph:shield-plus-fill" width="18" height="18"></iconify-icon>
                <h4 className="font-serif opsz-72 font-semibold text-[18px] text-ink">
                  Advisory Triage
                </h4>
              </div>
              <p className="text-xs text-inkmute leading-relaxed">
                Flags red-flag emergency symptoms immediately, safeguarding patients while keeping licensed doctors in total diagnostic control.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          4. PROOF / STAT LIST (HAIRLINE-DIVIDED BIG-NUMBER)
          ══════════════════════════════════════════════════ */}
      <section id="proof" className="scroll-mt-24">
        <div className="border-t border-b border-ink/14">
          {[
            {
              num: '12,400+',
              desc: 'Patient intakes organized across district health centers and rural walk-in kiosks without requiring email or login.',
              tag: 'Intakes Organized',
            },
            {
              num: '4.8 min',
              desc: 'Average intake completion from initial dialect symptom speech to hospital clinical queue arrival.',
              tag: 'Triage Speed',
            },
            {
              num: '2,100+',
              desc: 'Subsidized PMBJP Jan Aushadhi generic medicine orders fulfilled through nearest pharmacy kendras.',
              tag: 'Generic Access',
            },
            {
              num: '100%',
              desc: 'Physician sovereignty. AI is strictly advisory; all diagnoses and prescriptions are finalized by verified doctors.',
              tag: 'Clinical Safety',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`hover-row grid grid-cols-1 md:grid-cols-12 items-baseline gap-4 py-8 md:py-10 ${
                idx < 3 ? 'border-b border-ink/12' : ''
              }`}
            >
              {/* col-span-4 = Big number */}
              <div className="md:col-span-4">
                <span className="font-serif opsz-144 font-medium text-num text-ink">
                  {item.num}
                </span>
              </div>

              {/* col-span-5 = Description */}
              <div className="md:col-span-5">
                <p className="text-inkmute text-[15px] md:text-[16px] leading-relaxed max-w-md">
                  {item.desc}
                </p>
              </div>

              {/* col-span-3 = Magenta uppercase tag */}
              <div className="md:col-span-3 md:text-right">
                <span className="eyebrow">{item.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          5. DARK INK CLINICAL GOVERNANCE CARD (GUINEX)
          ══════════════════════════════════════════════════ */}
      <section id="clinical" className="scroll-mt-24">
        <div className="relative bg-ink text-cream rounded-[24px] p-8 md:p-14 overflow-hidden shadow-xl">
          {/* Soft magenta radial glow blob bleeding off top-right corner */}
          <div
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #d6246e 0%, transparent 70%)' }}
          ></div>

          <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8">
            {/* Left 3 cols: Eyebrow + Attribution */}
            <div className="md:col-span-3 space-y-6">
              <span className="eyebrow block">Clinical Governance</span>

              <div className="flex items-center gap-3.5 pt-2">
                <div className="w-12 h-12 rounded-full bg-magenta flex items-center justify-center font-serif text-cream font-medium text-xl shrink-0">
                  G
                </div>
                <div>
                  <h4 className="font-serif opsz-40 font-semibold text-cream text-base">
                    Guinex Medical Board
                  </h4>
                  <p className="text-xs text-cream/55 font-light">
                    Clinical Architecture & Oversight
                  </p>
                </div>
              </div>
            </div>

            {/* Right 8 cols (col-start-5): Pull-quote + Sign-off */}
            <div className="md:col-span-8 md:col-start-5 space-y-6">
              <blockquote className="font-serif opsz-96 font-light text-pullquote text-cream leading-[1.25]">
                "The first five minutes of healthcare should{' '}
                <span className="italic font-normal text-magenta">never be paperwork</span>.
                {' '}It should be human listening, captured with precision before distress escalates."
              </blockquote>

              <div className="space-y-4 text-cream/70 font-light text-sm md:text-base leading-relaxed max-w-[58ch]">
                <p>
                  When a mother brings her ailing child to a district clinic, she shouldn't have to fill out complex forms or struggle with user accounts. She has her voice, her mother tongue, and her urgency.
                </p>
                <p>
                  Guinex engineered Jan Saathi AI to restore dignity to public health intake: listening in regional dialects, recording live sensor telemetry via ESP32 kiosks, and placing complete clinical context in front of doctors before they even step into the room.
                </p>
              </div>

              {/* Sign-off row */}
              <div className="pt-6 border-t border-cream/10 flex items-end justify-between">
                <div>
                  <div className="font-serif opsz-96 italic text-magenta text-[30px] md:text-[38px] leading-none mb-1">
                    Guinex Healthcare
                  </div>
                  <span className="uppercase text-[11px] tracking-[0.28em] text-cream/45 font-medium">
                    Clinical Systems Division
                  </span>
                </div>

                <div className="opacity-15">
                  <iconify-icon icon="ph:heartbeat-fill" width="48" height="48" style={{ color: '#faf6ef' }}></iconify-icon>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          6. 4-UP NUMBERED HEALTHCARE PRINCIPLES
          ══════════════════════════════════════════════════ */}
      <section id="principles" className="space-y-12 scroll-mt-24">
        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-ink/10 pb-6">
          <h2 className="font-serif opsz-144 font-medium text-display-sm leading-tight">
            What Guinex holds{' '}
            <span className="italic font-light text-magenta">vital</span>.
          </h2>
          <p className="text-xs md:text-sm text-inkmute max-w-[34ch] leading-relaxed">
            Four non-negotiable principles guiding every medical triage flow, hardware sensor integration, and patient interaction.
          </p>
        </div>

        {/* 2x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {[
            {
              num: '01',
              title: 'Zero patient accounts required',
              desc: 'Never demand a login or password where healthcare is needed. Cryptographic high-entropy case access tokens grant patients private record access without account friction.',
            },
            {
              num: '02',
              title: 'Indian mother tongues first',
              desc: 'Language must never be a barrier to clinical triage. Jan Saathi AI supports native conversational voice in Odia, Hindi, Bengali, Telugu, and English.',
            },
            {
              num: '03',
              title: 'Licensed physician sovereignty',
              desc: 'AI triage is strictly advisory. Final diagnosis, prescription issuance, and clinical dispositions remain the exclusive domain of verified medical doctors.',
            },
            {
              num: '04',
              title: 'Direct generic medicine access',
              desc: 'Integrated with Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP) to automatically map prescribed drugs to quality subsidized generics with 70–90% savings.',
            },
          ].map((val) => (
            <div key={val.num} className="border-t border-ink/15 pt-7 space-y-2.5">
              <div className="flex items-baseline gap-3">
                <span className="font-serif opsz-144 font-medium text-magenta text-xl">
                  {val.num}
                </span>
                <h3 className="font-serif opsz-72 font-semibold text-lg md:text-xl text-ink">
                  {val.title}
                </h3>
              </div>
              <p className="text-inkmute text-[15.5px] leading-relaxed md:pl-9">
                {val.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          7. INTERACTIVE LANGUAGE & VOICE SHOWCASE
          ══════════════════════════════════════════════════ */}
      <section className="bg-creamdeep rounded-2xl border border-ink/10 p-8 md:p-12 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-ink/10 pb-6">
          <div>
            <span className="eyebrow block mb-2">Multilingual Patient Gateway</span>
            <h2 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">
              Choose your language. Begin intake now.
            </h2>
          </div>
          <p className="text-xs text-inkmute max-w-sm">
            Select your preferred dialect for typed forms or speak directly with our conversational voice intake agent.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2.5">
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLanguage(l.code as SupportedLanguage)}
                className={`px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all duration-300 border ${
                  language === l.code
                    ? 'bg-ink text-cream border-ink shadow-sm'
                    : 'bg-cream text-inkmute border-ink/12 hover:border-ink hover:text-ink'
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 flex flex-wrap items-center gap-4">
          <Link
            to="/patient/language"
            className="pill pill-magenta px-7 py-3.5 text-sm font-medium inline-flex items-center gap-2"
          >
            <iconify-icon icon="ph:user-circle-bold" width="16" height="16"></iconify-icon>
            <span>Go to Patient Portal</span>
            <iconify-icon icon="ph:arrow-right-bold" width="14" height="14"></iconify-icon>
          </Link>

          <Link
            to="/patient/case-access"
            className="pill pill-ghost-ink px-5 py-3.5 text-xs text-inkmute hover:text-magenta"
          >
            <iconify-icon icon="ph:magnifying-glass-bold" width="14" height="14"></iconify-icon>
            <span>{t('checkExistingCase')}</span>
          </Link>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          8. FULL-BLEED MAGENTA CTA BAND (GUINEX HEALTHCARE)
          ══════════════════════════════════════════════════ */}
      <section id="join" className="relative bg-magenta rounded-[28px] p-10 md:p-16 text-cream overflow-hidden shadow-lg scroll-mt-24">
        {/* Faint cream grid texture overlay (60px cells at 12% opacity) */}
        <div className="absolute inset-0 grid-texture-magenta"></div>

        {/* Soft ink radial glow blob bleeding off bottom-left */}
        <div
          className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #16130f 0%, transparent 70%)' }}
        ></div>

        <div className="relative z-10 space-y-6">
          <span className="uppercase text-[12px] tracking-[0.28em] font-semibold text-cream/75 block">
            Guinex Public Health Intake
          </span>

          <h2 className="font-serif opsz-144 font-medium text-display-lg max-w-[20ch] leading-[0.98]">
            Describe your symptoms.{' '}
            <span className="italic font-light">Guinex organizes the care.</span>
          </h2>

          <div className="flex flex-wrap items-center gap-4 pt-4">
            <Link
              to="/patient/language"
              className="pill pill-cream px-7 py-3.5 text-sm font-medium inline-flex items-center gap-2"
            >
              <span>Go to Patient Portal</span>
              <iconify-icon icon="ph:arrow-right-bold" width="14" height="14"></iconify-icon>
            </Link>

            <Link
              to="/doctor/login"
              className="pill pill-ghost px-6 py-3.5 text-sm"
            >
              <span>Clinician Portal Login</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
