import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getDashboardStats,
  getCases,
  getNotifications,
  acknowledgeNotification,
  updateCaseStatus,
} from '../../api/doctorApi';
import { useAuth } from '../../contexts/useAuth';
import type { DashboardStats, CaseSummary, Notification } from '../../types';

// Standard Clinical Presets for fast OPD consultation reference
const CLINICAL_PRESETS = [
  {
    id: 'urti',
    title: 'Acute Upper Respiratory Tract Infection (Viral)',
    category: 'Respiratory / General',
    diagnosis: 'Acute viral nasopharyngitis / uncomplicated upper respiratory infection',
    medicines: [
      { name: 'Tab Paracetamol', dose: '500mg', freq: 'TDS (thrice daily) as needed', duration: '3 days', notes: 'For fever and body ache, take after food' },
      { name: 'Tab Cetirizine', dose: '10mg', freq: 'OD (once daily at bedtime)', duration: '5 days', notes: 'For rhinorrhea and sneezing' },
      { name: 'Syp Dextromethorphan / Cough Syrup', dose: '10ml', freq: 'TDS', duration: '5 days', notes: 'If dry cough is persistent' },
    ],
    advice: 'Steam inhalation twice daily, warm saline gargles, plenty of lukewarm fluids, and adequate rest. Avoid chilled foods.',
    redFlags: 'High-grade fever > 102°F persisting beyond 3 days, acute breathlessness, hemoptysis, or severe chest pain.',
  },
  {
    id: 'ge',
    title: 'Acute Gastroenteritis & Dehydration',
    category: 'Gastrointestinal',
    diagnosis: 'Acute acute watery diarrhea with mild dehydration',
    medicines: [
      { name: 'ORS (Oral Rehydration Salts)', dose: '1 packet in 1L boiled/cooled water', freq: 'Sip frequently after each loose stool', duration: '3 days', notes: 'Continue until stools form' },
      { name: 'Tab Zinc Sulfate', dose: '20mg', freq: 'OD (once daily)', duration: '14 days', notes: 'Mucosal healing and immunity' },
      { name: 'Tab Ondansetron', dose: '4mg', freq: 'SOS (if vomiting persists)', duration: '2 days', notes: 'Take 30 mins before food' },
      { name: 'Cap Probiotics (Lactobacillus)', dose: '1 cap', freq: 'BD (twice daily)', duration: '5 days', notes: 'Restores gut microflora' },
    ],
    advice: 'Strictly boiled or filtered water, light khichdi, curd, banana, and coconut water. Avoid oily/spicy foods and dairy milk.',
    redFlags: 'Blood in stool, inability to retain oral fluids, extreme lethargy, sunken eyes, or reduced urine output.',
  },
  {
    id: 'msk',
    title: 'Musculoskeletal Strain & Lumbar Sprain',
    category: 'Orthopedic / Pain',
    diagnosis: 'Acute mechanical back strain / soft tissue injury',
    medicines: [
      { name: 'Tab Paracetamol + Aceclofenac', dose: '325mg + 100mg', freq: 'BD after food', duration: '5 days', notes: 'Analgesic anti-inflammatory' },
      { name: 'Tab Pantoprazole', dose: '40mg', freq: 'OD (30 mins before breakfast)', duration: '5 days', notes: 'Gastric protection' },
      { name: 'Gel Diclofenac Topical', dose: 'Pea-sized application', freq: 'TDS gentle application', duration: '5 days', notes: 'Do not vigorously rub' },
    ],
    advice: 'Relative rest for 48 hours, avoid lifting heavy loads and forward bending. Apply hot compress after 48 hours. Firm mattress recommended.',
    redFlags: 'Numbness or weakness in lower limbs, urinary or fecal incontinence, radiating pain below knee.',
  },
  {
    id: 'htn',
    title: 'Essential Hypertension (Routine OPD Follow-up)',
    category: 'Cardiovascular',
    diagnosis: 'Stage 1 Essential Hypertension without acute target organ damage',
    medicines: [
      { name: 'Tab Amlodipine', dose: '5mg', freq: 'OD (morning with water)', duration: '30 days', notes: 'Calcium channel blocker' },
      { name: 'Tab Telmisartan (if indicated)', dose: '40mg', freq: 'OD (morning)', duration: '30 days', notes: 'Monitor serum creatinine' },
    ],
    advice: 'Dietary restriction of salt (< 5g/day), brisk walking 30 mins daily, avoid pickles/papad/processed snacks. Maintain daily BP log.',
    redFlags: 'Sudden severe occipital headache, blurred vision, acute chest tightness, or facial asymmetry.',
  },
  {
    id: 'dm',
    title: 'Type 2 Diabetes Mellitus (Uncomplicated Control)',
    category: 'Endocrine',
    diagnosis: 'Type 2 Diabetes Mellitus on oral hypoglycemic agents',
    medicines: [
      { name: 'Tab Metformin Sustained Release', dose: '500mg', freq: 'BD with or immediately after major meals', duration: '30 days', notes: 'Improves insulin sensitivity' },
    ],
    advice: 'Low glycemic index diet, portion control, avoid refined sugars/sweets. Daily foot inspection for cuts or abrasions. Annual eye and kidney screening.',
    redFlags: 'Symptoms of hypoglycemia (sweating, dizziness, palpitations, confusion) — consume 3 spoons of sugar/glucose immediately.',
  },
  {
    id: 'ped_fever',
    title: 'Pediatric Febrile Illness (Supportive Protocol)',
    category: 'Pediatrics',
    diagnosis: 'Pediatric acute febrile illness under evaluation',
    medicines: [
      { name: 'Syp Paracetamol (250mg/5ml)', dose: '15mg/kg per dose', freq: 'QDS (every 6 hrs) only if temp > 100.4°F', duration: '3 days', notes: 'Never exceed 4 doses in 24 hrs' },
    ],
    advice: 'Tepid water sponging on forehead/limbs. Light cotton clothing, encourage oral breastfeeds or fluids. Never use cold or ice water.',
    redFlags: 'Febrile convulsions, excessive irritability or abnormal drowsiness, refusal to feed, or rapid breathing.',
  },
];

const nowMs = () => Date.now();
const getCurrentHour = () => new Date().getHours();

export const DashboardPage: React.FC = () => {
  const { doctor } = useAuth();
  const navigate = useNavigate();

  // Dashboard Stats State
  const [stats, setStats] = useState<DashboardStats>({
    total_cases: 0,
    submitted: 0,
    under_review: 0,
    closed: 0,
    emergency: 0,
    urgent: 0,
    elevated: 0,
    normal: 0,
    today_cases: 0,
    language_breakdown: {},
    my_active_cases: 0,
  });

  // Cases State
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  // Filter & Search Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'priority' | 'new' | 'review' | 'closed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('');


  // Clinical Preset Reference Modal
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<any>(CLINICAL_PRESETS[0]);
  const [presetCopied, setPresetCopied] = useState(false);

  // Time & Greeting
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const [greeting] = useState(() => {
    const hour = getCurrentHour();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  });

  const searchQueryRef = React.useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Fetch Dashboard Data
  const loadDashboardData = React.useCallback(async (silent = false, searchOverride?: string) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const effectiveSearch = (searchOverride !== undefined ? searchOverride : searchQueryRef.current).trim();
      // 1. Fetch metrics
      const statsData = await getDashboardStats();
      setStats(statsData);

      // 2. Fetch cases (top 30 recent for interactive dashboard queue)
      const casesData = await getCases({
        page: 1,
        page_size: 30,
        search: effectiveSearch || undefined,
        priority: priorityFilter || undefined,
      } as any);
      setCases(casesData.items || []);

      // 3. Fetch notifications
      const notifs = await getNotifications();
      setNotifications(notifs || []);
    } catch (err) {
      console.error('Failed to load doctor dashboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [priorityFilter]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void loadDashboardData();
    });
    return () => {
      active = false;
    };
  }, [loadDashboardData]);

  // Handle Quick Search submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadDashboardData(true, searchQuery);
  };

  // Quick Direct Jump to Case
  const handleDirectJump = (caseId: string) => {
    if (!caseId) return;
    navigate(`/doctor/cases/${caseId}`);
  };

  // Quick Status change from table
  const handleQuickStatusUpdate = async (caseId: string, newStatus: string) => {
    try {
      await updateCaseStatus(caseId, newStatus);
      await loadDashboardData(true);
    } catch (err) {
      console.error(err);
      alert('Could not update case status.');
    }
  };

  // Acknowledge notification
  const handleAcknowledgeNotification = async (notifId: string) => {
    setAcknowledgingId(notifId);
    try {
      await acknowledgeNotification(notifId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, acknowledged: true, is_read: true } : n))
      );
      // Reload stats
      const newStats = await getDashboardStats();
      setStats(newStats);
    } catch (err) {
      console.error(err);
    } finally {
      setAcknowledgingId(null);
    }
  };


  // Filter cases based on active tab
  const filteredCases = useMemo(() => {
    let result = cases;

    if (activeTab === 'priority') {
      result = result.filter((c) => c.priority === 'emergency' || c.priority === 'urgent');
    } else if (activeTab === 'new') {
      result = result.filter((c) => c.status === 'submitted');
    } else if (activeTab === 'review') {
      result = result.filter((c) => c.status === 'under_review');
    } else if (activeTab === 'closed') {
      result = result.filter((c) => c.status === 'closed' || c.status === 'response_submitted');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.public_case_id?.toLowerCase().includes(q) ||
          c.patient_name?.toLowerCase().includes(q) ||
          c.chief_complaint?.toLowerCase().includes(q) ||
          (c.patient_contact && c.patient_contact.includes(q))
      );
    }

    return result;
  }, [cases, activeTab, searchQuery]);

  // Relative time helper
  const getRelativeTime = (isoString: string) => {
    try {
      const diffMs = nowMs() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  // Badge helpers
  const priorityBadge = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-magenta text-cream shadow-sm animate-pulse">
            <iconify-icon icon="ph:siren-fill" width="11" height="11"></iconify-icon>
            Emergency
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-ink/10 text-ink border border-ink/20">
            <iconify-icon icon="ph:warning-circle-bold" width="11" height="11"></iconify-icon>
            Urgent
          </span>
        );
      case 'elevated':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-creamdeep text-inkmute border border-ink/15">
            Elevated
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase bg-creamdeep text-inkmute/80 border border-ink/8">
            Routine
          </span>
        );
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-ink/8 text-ink border border-ink/15">
            <span className="w-1.5 h-1.5 rounded-full bg-ink animate-ping" />
            New Intake
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-magenta/10 text-magenta border border-magenta/25">
            <iconify-icon icon="ph:stethoscope-bold" width="11" height="11"></iconify-icon>
            Under Review
          </span>
        );
      case 'response_submitted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-magenta/15 text-magentadeep border border-magenta/30">
            <iconify-icon icon="ph:check-bold" width="11" height="11"></iconify-icon>
            Rx Dispatched
          </span>
        );
      case 'closed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-creamdeep text-inkmute border border-ink/10">
            Closed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-creamdeep text-inkmute border border-ink/8">
            {status}
          </span>
        );
    }
  };

  // Language display
  const languageLabel = (lang?: string) => {
    switch (lang?.toLowerCase()) {
      case 'or':
      case 'odia':
        return { name: 'ଓଡ଼ିଆ (Odia)', badge: 'bg-magenta/10 text-magenta border-magenta/20' };
      case 'hi':
      case 'hindi':
        return { name: 'हिंदी (Hindi)', badge: 'bg-ink/8 text-ink border-ink/15' };
      default:
        return { name: 'English', badge: 'bg-creamdeep text-inkmute border-ink/10' };
    }
  };

  // Calculate priority breakdown percentages
  const priorityTotal = stats.total_cases || 1;
  const pEmergencyPct = Math.round((stats.emergency / priorityTotal) * 100);
  const pUrgentPct = Math.round((stats.urgent / priorityTotal) * 100);
  const pElevatedPct = Math.round(((stats.elevated || 0) / priorityTotal) * 100);
  const pNormalPct = Math.max(0, 100 - (pEmergencyPct + pUrgentPct + pElevatedPct));

  // Copy clinical preset text
  const handleCopyPreset = (preset: any) => {
    const medsText = preset.medicines
      .map((m: any, idx: number) => `${idx + 1}. ${m.name} (${m.dose}) - ${m.freq} for ${m.duration} [${m.notes}]`)
      .join('\n');
    const fullText = `DIAGNOSIS: ${preset.diagnosis}\n\nPRESCRIPTION:\n${medsText}\n\nCLINICAL ADVICE:\n${preset.advice}\n\nRED FLAG WARNINGS:\n${preset.redFlags}`;
    navigator.clipboard.writeText(fullText);
    setPresetCopied(true);
    setTimeout(() => setPresetCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Clinical Header Bar ── */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 md:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="eyebrow text-[10px] text-magenta font-bold">
              {doctor?.is_admin ? 'Clinical Administrator' : 'Attending Physician'}
            </span>
            <span className="text-inkmute/40">•</span>
            <span className="text-xs text-inkmute flex items-center gap-1">
              <iconify-icon icon="ph:clock-bold" width="13" height="13"></iconify-icon>
              <span>{currentTime || 'Synchronizing workstation time...'}</span>
            </span>
          </div>
          <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink tracking-tight">
            {greeting}, Dr. {doctor?.full_name?.split(' ')[0] || 'Clinician'}
          </h1>
          <p className="text-xs text-inkmute mt-1">
            Jan Saathi AI Clinical Command Center • Real-time patient intake and automated triage telemetry.
          </p>
        </div>

        {/* Quick Workstation Shortcuts */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
          <button
            onClick={() => setShowPresetsModal(true)}
            className="pill pill-secondary px-3.5 py-2 text-xs font-semibold"
            title="Browse standard OPD prescription templates & treatment guidelines"
          >
            <iconify-icon icon="ph:book-bookmark-bold" width="14" height="14"></iconify-icon>
            <span>Formulary Presets</span>
          </button>

          <button
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="pill pill-ink px-3.5 py-2 text-xs font-semibold"
            title="Refresh clinical database"
          >
            <iconify-icon
              icon="ph:arrows-clockwise-bold"
              width="14"
              height="14"
              className={isRefreshing ? 'animate-spin' : ''}
            ></iconify-icon>
            <span>{isRefreshing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* ── Emergency Siren Alert Banner ── */}
      {(stats.emergency > 0 || stats.urgent > 0) && (
        <div className="bg-gradient-to-r from-magenta/15 via-magenta/10 to-transparent border-l-4 border-magenta border-y border-r border-magenta/25 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-pulse">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-magenta text-cream flex items-center justify-center shrink-0 shadow-md">
              <iconify-icon icon="ph:siren-fill" width="22" height="22"></iconify-icon>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-ink uppercase tracking-wide">
                  Clinical Emergency Triage Alert
                </h2>
                <span className="bg-magenta text-cream text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-inkmute mt-0.5">
                <strong className="text-magenta">{stats.emergency} Emergency</strong> and{' '}
                <strong className="text-ink">{stats.urgent} Urgent</strong> patient case(s) waiting for physician assessment.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => {
                setActiveTab('priority');
                setPriorityFilter('');
              }}
              className="pill pill-magenta px-4 py-2 text-xs font-bold"
            >
              <span>Filter Priority Cases</span>
              <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
            </button>
          </div>
        </div>
      )}

      {/* ── 6 Clinical Metric Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          {
            label: 'Emergency & Urgent',
            value: stats.emergency + stats.urgent,
            desc: `${stats.emergency} Critical / ${stats.urgent} High`,
            icon: 'ph:siren-fill',
            accent: stats.emergency + stats.urgent > 0,
            filter: 'priority',
          },
          {
            label: 'Awaiting Review',
            value: stats.submitted,
            desc: 'New patient intakes',
            icon: 'ph:clock-bold',
            accent: false,
            filter: 'new',
          },
          {
            label: 'Under Active Care',
            value: stats.under_review,
            desc: 'Clinician assessments',
            icon: 'ph:activity-bold',
            accent: false,
            filter: 'review',
          },
          {
            label: "Today's Intakes",
            value: stats.today_cases || 0,
            desc: 'Registered since 00:00',
            icon: 'ph:calendar-check-bold',
            accent: false,
            filter: 'all',
          },
          {
            label: 'Discharged / Closed',
            value: stats.closed,
            desc: 'Completed clinical cases',
            icon: 'ph:check-circle-bold',
            accent: false,
            filter: 'closed',
          },
          {
            label: 'Hospital Registry',
            value: stats.total_cases,
            desc: 'Cumulative intakes',
            icon: 'ph:database-bold',
            accent: false,
            filter: 'all',
          },
        ].map((card, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(card.filter as any)}
            className={`text-left rounded-2xl border p-4 transition-all duration-200 hover:shadow-md cursor-pointer ${
              card.accent
                ? 'bg-magenta/8 border-magenta/30 hover:border-magenta'
                : 'bg-creamdeep border-ink/8 hover:border-ink/20'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-inkmute">
                {card.label}
              </span>
              <iconify-icon
                icon={card.icon}
                width="16"
                height="16"
                style={{ color: card.accent ? '#d6246e' : '#5a544a' }}
              ></iconify-icon>
            </div>
            <div className={`font-serif opsz-144 font-medium text-2xl md:text-3xl ${
              card.accent ? 'text-magenta font-bold' : 'text-ink'
            }`}>
              {isLoading ? '...' : card.value}
            </div>
            <p className="text-[10px] text-inkmute mt-1 truncate">{card.desc}</p>
          </button>
        ))}
      </div>

      {/* ── Rapid Patient Lookup & Tele-Intake Finder ── */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1 relative">
            <iconify-icon
              icon="ph:magnifying-glass-bold"
              width="16"
              height="16"
              style={{ color: '#5a544a', position: 'absolute', left: '14px', top: '11px' } as any}
            ></iconify-icon>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Case ID (e.g. JS-2026-XXXX), patient name, complaint, or contact number..."
              className="w-full border border-ink/14 rounded-xl pl-10 pr-4 py-2 text-xs md:text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="border border-ink/14 rounded-xl px-3 py-2 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
            >
              <option value="">All Priorities</option>
              <option value="emergency">🚨 Emergency</option>
              <option value="urgent">⚡ Urgent</option>
              <option value="elevated">⚠️ Elevated</option>
              <option value="normal">Normal</option>
            </select>

            {searchQuery.trim().startsWith('JS-') && (
              <button
                type="button"
                onClick={() => handleDirectJump(searchQuery.trim())}
                className="pill pill-ink px-4 py-2 text-xs font-semibold shrink-0"
              >
                <span>Jump to Case</span>
                <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
              </button>
            )}

            <button type="submit" className="pill pill-secondary px-4 py-2 text-xs font-semibold shrink-0">
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* ── Operational Insights: Priority Breakdown & Demographics & Hardware ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Priority Caseload Distribution */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-ink/8 pb-2.5">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wide flex items-center gap-1.5">
              <iconify-icon icon="ph:chart-pie-slice-bold" width="14" height="14"></iconify-icon>
              Triage Priority Split
            </h2>
            <span className="text-[10px] text-inkmute">Total: {stats.total_cases}</span>
          </div>

          {/* Color stacked bar */}
          <div className="w-full h-3 rounded-full bg-ink/10 overflow-hidden flex">
            {stats.emergency > 0 && (
              <div
                style={{ width: `${pEmergencyPct}%` }}
                className="bg-magenta h-full transition-all"
                title={`Emergency: ${stats.emergency} (${pEmergencyPct}%)`}
              />
            )}
            {stats.urgent > 0 && (
              <div
                style={{ width: `${pUrgentPct}%` }}
                className="bg-ink h-full transition-all"
                title={`Urgent: ${stats.urgent} (${pUrgentPct}%)`}
              />
            )}
            {(stats.elevated || 0) > 0 && (
              <div
                style={{ width: `${pElevatedPct}%` }}
                className="bg-creamdeep border border-ink/20 h-full transition-all"
                title={`Elevated: ${stats.elevated} (${pElevatedPct}%)`}
              />
            )}
            <div
              style={{ width: `${pNormalPct}%` }}
              className="bg-ink/20 h-full transition-all"
              title={`Normal: ${stats.normal || 0} (${pNormalPct}%)`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-magenta shrink-0" />
              <span className="text-ink font-medium">Emergency: {stats.emergency}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-ink shrink-0" />
              <span className="text-ink font-medium">Urgent: {stats.urgent}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-ink/40 shrink-0" />
              <span className="text-inkmute">Elevated: {stats.elevated || 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-ink/20 shrink-0" />
              <span className="text-inkmute">Routine: {stats.normal || 0}</span>
            </div>
          </div>
        </div>

        {/* Multilingual Intake Diversity */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-ink/8 pb-2.5">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wide flex items-center gap-1.5">
              <iconify-icon icon="ph:translate-bold" width="14" height="14"></iconify-icon>
              Linguistic Inclusivity
            </h2>
            <span className="text-[10px] text-inkmute">Rural Odisha & India</span>
          </div>

          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-cream border border-ink/6">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-magenta">ଓଡ଼ିଆ</span>
                <span className="text-[11px] text-inkmute">Odia Dialect Intake</span>
              </div>
              <strong className="text-ink font-mono">{stats.language_breakdown?.['or'] || 0} cases</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-cream border border-ink/6">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">हिंदी</span>
                <span className="text-[11px] text-inkmute">Hindi Regional Intake</span>
              </div>
              <strong className="text-ink font-mono">{stats.language_breakdown?.['hi'] || 0} cases</strong>
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-cream border border-ink/6">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-inkmute">English</span>
                <span className="text-[11px] text-inkmute">Standard Intake</span>
              </div>
              <strong className="text-ink font-mono">{stats.language_breakdown?.['en'] || 0} cases</strong>
            </div>
          </div>
        </div>

        {/* ESP32 Clinic Station Hub */}
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-ink/8 pb-2.5">
            <h2 className="text-xs font-bold text-ink uppercase tracking-wide flex items-center gap-1.5">
              <iconify-icon icon="ph:cpu-bold" width="14" height="14"></iconify-icon>
              Clinic Hub & Telemetry
            </h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
              Online
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="bg-cream p-2.5 rounded-xl border border-ink/6 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-inkmute font-medium">Station Device:</span>
                <span className="font-mono text-ink font-semibold">ESP32-S3 Rural Hub</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-inkmute font-medium">Sensors Prepared:</span>
                <span className="text-ink font-medium">MAX30102 • DS18B20</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-inkmute font-medium">Vital Streaming:</span>
                <span className="text-magenta font-semibold">HR, SpO2, Temperature</span>
              </div>
            </div>

            <Link
              to="/doctor/cases"
              className="w-full pill pill-ghost-ink py-2 text-[11px] justify-center flex items-center gap-1.5 font-medium"
            >
              <iconify-icon icon="ph:broadcast-bold" width="13" height="13"></iconify-icon>
              <span>Manage Hardware In Queue</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Interactive Clinical Case Queue ── */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 overflow-hidden shadow-xs">
        {/* Table Filter Tabs */}
        <div className="p-4 border-b border-ink/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cream/40">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            {[
              { id: 'all', label: 'All Patients', count: cases.length },
              {
                id: 'priority',
                label: '🚨 Priority Attention',
                count: cases.filter((c) => c.priority === 'emergency' || c.priority === 'urgent').length,
              },
              {
                id: 'new',
                label: '⏳ Awaiting Review',
                count: cases.filter((c) => c.status === 'submitted').length,
              },
              {
                id: 'review',
                label: '🩺 Under Review',
                count: cases.filter((c) => c.status === 'under_review').length,
              },
              {
                id: 'closed',
                label: '✅ Discharged / Rx',
                count: cases.filter((c) => c.status === 'closed' || c.status === 'response_submitted').length,
              },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-ink text-cream font-semibold shadow-xs'
                      : 'text-inkmute hover:text-ink hover:bg-ink/5'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      active ? 'bg-cream/20 text-cream' : 'bg-ink/8 text-inkmute'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <Link
            to="/doctor/cases"
            className="text-xs font-semibold text-magenta hover:underline flex items-center gap-1 shrink-0 self-start sm:self-auto"
          >
            <span>Open Full Case Queue</span>
            <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
          </Link>
        </div>

        {/* Cases Table */}
        {isLoading ? (
          <div className="py-16 text-center text-xs text-inkmute space-y-3">
            <div className="animate-spin w-7 h-7 border-2 border-magenta border-t-transparent rounded-full mx-auto" />
            <p>Loading patient records and clinical vitals...</p>
          </div>
        ) : filteredCases.length === 0 ? (
          <div className="py-16 text-center text-xs text-inkmute space-y-2">
            <div className="w-10 h-10 rounded-full bg-ink/6 flex items-center justify-center mx-auto text-inkmute">
              <iconify-icon icon="ph:clipboard-text-bold" width="20" height="20"></iconify-icon>
            </div>
            <p className="font-medium text-ink">No clinical cases match the active filter.</p>
            <p className="text-[11px] text-inkmute/70">Try changing the tab filter or clearing the search box.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-cream/70 text-inkmute font-semibold border-b border-ink/10">
                <tr>
                  <th className="p-3.5">Case ID</th>
                  <th className="p-3.5">Patient Details</th>
                  <th className="p-3.5">Language</th>
                  <th className="p-3.5">Chief Complaint</th>
                  <th className="p-3.5">Vitals Snapshot</th>
                  <th className="p-3.5">Priority</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Registered</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {filteredCases.map((c) => {
                  const lang = languageLabel(c.preferred_language);
                  const vitals = c.latest_vitals;

                  // Evaluate vital alerts
                  const hr = vitals?.['heart_rate']?.value;
                  const spo2 = vitals?.['spo2']?.value;
                  const temp = vitals?.['temperature']?.value;

                  const isSpo2Critical = spo2 !== undefined && spo2 < 92;
                  const isTempHigh = temp !== undefined && temp > 100.4;
                  const isHrAbnormal = hr !== undefined && (hr > 100 || hr < 55);

                  return (
                    <tr
                      key={c.id || c.public_case_id}
                      className="hover:bg-cream/80 transition-colors group"
                    >
                      {/* Case ID */}
                      <td className="p-3.5 font-mono font-bold text-ink whitespace-nowrap">
                        <Link
                          to={`/doctor/cases/${c.public_case_id || c.id}`}
                          className="hover:text-magenta transition-colors hover:underline"
                        >
                          {c.public_case_id}
                        </Link>
                      </td>

                      {/* Patient Info */}
                      <td className="p-3.5 whitespace-nowrap">
                        <strong className="text-ink block text-xs font-semibold">{c.patient_name}</strong>
                        <span className="text-[11px] text-inkmute flex items-center gap-1.5">
                          <span>{c.patient_age ? `${c.patient_age}y` : '--'}, {c.patient_gender || 'Not stated'}</span>
                          {c.patient_contact && (
                            <>
                              <span className="text-inkmute/40">•</span>
                              <span className="font-mono text-[10px]">{c.patient_contact}</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Language */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${lang.badge}`}>
                          {lang.name}
                        </span>
                      </td>

                      {/* Chief Complaint */}
                      <td className="p-3.5 max-w-xs truncate" title={c.chief_complaint}>
                        <span className="text-ink font-medium block truncate">{c.chief_complaint}</span>
                        {c.complaint_duration && (
                          <span className="text-[10px] text-inkmute">
                            Duration: {c.complaint_duration}
                          </span>
                        )}
                      </td>

                      {/* Vitals Snapshot */}
                      <td className="p-3.5 whitespace-nowrap">
                        {vitals && Object.keys(vitals).length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                            {hr !== undefined && (
                              <span
                                className={`px-1.5 py-0.5 rounded border ${
                                  isHrAbnormal
                                    ? 'bg-red-50 text-red-700 border-red-300 font-bold'
                                    : 'bg-cream text-ink border-ink/10'
                                }`}
                                title={`Heart Rate: ${hr} bpm`}
                              >
                                ❤️ {hr} bpm
                              </span>
                            )}
                            {spo2 !== undefined && (
                              <span
                                className={`px-1.5 py-0.5 rounded border ${
                                  isSpo2Critical
                                    ? 'bg-magenta/15 text-magentadeep border-magenta/40 font-bold animate-pulse'
                                    : 'bg-cream text-ink border-ink/10'
                                }`}
                                title={`Blood Oxygen SpO2: ${spo2}%`}
                              >
                                🫁 {spo2}%
                              </span>
                            )}
                            {temp !== undefined && (
                              <span
                                className={`px-1.5 py-0.5 rounded border ${
                                  isTempHigh
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                    : 'bg-cream text-ink border-ink/10'
                                }`}
                                title={`Body Temperature: ${temp}°F`}
                              >
                                🌡️ {temp}°F
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-inkmute/60 italic">No vitals yet</span>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="p-3.5 whitespace-nowrap">{priorityBadge(c.priority)}</td>

                      {/* Status */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {statusBadge(c.status)}
                          {/* Quick status dropdown */}
                          <select
                            value={c.status}
                            onChange={(e) => handleQuickStatusUpdate(c.public_case_id || (c as any).id, e.target.value)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity bg-cream text-[10px] border border-ink/12 rounded px-1 py-0.5 text-ink focus:opacity-100 focus:outline-none"
                            title="Quickly change workflow status"
                          >
                            <option value="submitted">New Intake</option>
                            <option value="under_review">Under Review</option>
                            <option value="response_submitted">Response Given</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                      </td>

                      {/* Registered Time */}
                      <td className="p-3.5 text-inkmute whitespace-nowrap text-[11px]" title={new Date(c.created_at).toLocaleString()}>
                        {getRelativeTime(c.created_at)}
                      </td>

                      {/* Action */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <Link
                          to={`/doctor/cases/${c.public_case_id || (c as any).id}`}
                          className="pill pill-ink px-3.5 py-1.5 text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <span>Review</span>
                          <iconify-icon icon="ph:arrow-right-bold" width="10" height="10"></iconify-icon>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Priority Notifications & Alert Gateway Feed ── */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-ink/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-magenta/15 text-magenta flex items-center justify-center">
              <iconify-icon icon="ph:bell-ringing-bold" width="15" height="15"></iconify-icon>
            </div>
            <div>
              <h2 className="font-serif opsz-72 text-sm font-semibold text-ink">Clinical Dispatch & Priority Alert Stream</h2>
              <p className="text-[11px] text-inkmute">Automated WhatsApp SMS alerts, triage alarms, and doctor notices</p>
            </div>
          </div>
          <Link
            to="/doctor/notifications"
            className="text-xs font-semibold text-magenta hover:underline flex items-center gap-1"
          >
            <span>All Alerts</span>
            <iconify-icon icon="ph:arrow-right-bold" width="12" height="12"></iconify-icon>
          </Link>
        </div>

        {notifications.length === 0 ? (
          <p className="text-xs text-inkmute py-6 text-center">No alerts or notifications recorded.</p>
        ) : (
          <div className="space-y-2.5">
            {notifications.slice(0, 4).map((n) => {
              const isAlert = n.type?.includes('emergency') || n.title?.toLowerCase().includes('emergency');
              return (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors ${
                    n.is_read || (n as any).acknowledged
                      ? 'bg-cream/40 border-ink/6'
                      : 'bg-cream border-magenta/25 shadow-xs'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <iconify-icon
                      icon={isAlert ? 'ph:warning-circle-fill' : 'ph:chat-teardrop-text-fill'}
                      width="18"
                      height="18"
                      style={{ color: isAlert ? '#d6246e' : '#5a544a', marginTop: '2px' }}
                    ></iconify-icon>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-ink font-semibold">{n.title}</strong>
                        {!(n.is_read || (n as any).acknowledged) && (
                          <span className="bg-magenta text-cream text-[9px] font-bold px-1.5 py-0.2 rounded uppercase">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-inkmute text-[11px] leading-relaxed line-clamp-1">{n.message}</p>
                      <span className="text-[10px] text-inkmute/60 block pt-0.5">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {n.case_id && (
                      <Link
                        to={`/doctor/cases/${n.case_id}`}
                        className="pill pill-ghost-ink px-3 py-1 text-[11px] font-medium"
                      >
                        Open Case
                      </Link>
                    )}
                    {!(n.is_read || (n as any).acknowledged) && (
                      <button
                        type="button"
                        disabled={acknowledgingId === n.id}
                        onClick={() => handleAcknowledgeNotification(n.id)}
                        className="pill pill-ink px-3 py-1 text-[11px] font-medium"
                      >
                        {acknowledgingId === n.id ? 'Saving...' : 'Acknowledge'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Clinical Formulary & Presets Reference Modal ── */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-creamdeep rounded-2xl shadow-2xl max-w-2xl w-full border border-ink/10 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-ink text-cream p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-magenta text-cream flex items-center justify-center">
                  <iconify-icon icon="ph:book-bookmark-fill" width="16" height="16"></iconify-icon>
                </div>
                <div>
                  <h3 className="font-serif opsz-72 text-sm font-semibold">
                    Jan Saathi Clinical Presets & Formulary Reference
                  </h3>
                  <p className="text-[11px] text-cream/60">
                    Standard rural outpatient protocols & guideline dosages
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="text-cream/70 hover:text-cream p-1.5 rounded-lg hover:bg-cream/10 transition-colors"
              >
                <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Presets Selector Chips */}
              <div className="flex flex-wrap gap-2 pb-3 border-b border-ink/10">
                {CLINICAL_PRESETS.map((p) => {
                  const isSel = selectedPreset.id === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPreset(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isSel
                          ? 'bg-magenta text-cream shadow-xs'
                          : 'bg-cream text-ink border border-ink/10 hover:border-ink/30'
                      }`}
                    >
                      {p.title.split(' ')[0]} {p.title.split(' ')[1]}
                    </button>
                  );
                })}
              </div>

              {/* Selected Preset Details */}
              <div className="space-y-4 bg-cream p-5 rounded-2xl border border-ink/10">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-magenta block mb-1">
                    {selectedPreset.category}
                  </span>
                  <h4 className="font-serif opsz-72 text-base font-semibold text-ink">
                    {selectedPreset.title}
                  </h4>
                  <p className="text-inkmute text-xs mt-1">
                    <strong>Working Diagnosis:</strong> {selectedPreset.diagnosis}
                  </p>
                </div>

                {/* Medicines List */}
                <div className="space-y-2">
                  <h5 className="font-semibold text-ink text-xs uppercase tracking-wide">
                    Medication Protocol (Generic Formulations)
                  </h5>
                  <div className="space-y-2">
                    {selectedPreset.medicines.map((m: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-creamdeep p-3 rounded-xl border border-ink/8 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <strong className="text-ink font-semibold">{m.name}</strong>{' '}
                          <span className="text-magenta font-mono">({m.dose})</span>
                          <p className="text-inkmute text-[11px] mt-0.5">{m.notes}</p>
                        </div>
                        <div className="text-right sm:text-right text-[11px] text-ink font-medium">
                          <span className="bg-ink/6 px-2 py-0.5 rounded font-mono block sm:inline-block">
                            {m.freq}
                          </span>
                          <span className="text-inkmute block sm:inline-block sm:ml-2">
                            {m.duration}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dietary & Lifestyle Advice */}
                <div className="space-y-1">
                  <h5 className="font-semibold text-ink text-xs">Clinical Guidance & Diet:</h5>
                  <p className="text-inkmute leading-relaxed">{selectedPreset.advice}</p>
                </div>

                {/* Red Flags */}
                <div className="space-y-1 bg-magenta/8 p-3 rounded-xl border border-magenta/20">
                  <h5 className="font-bold text-magenta text-xs flex items-center gap-1">
                    <iconify-icon icon="ph:warning-bold" width="13" height="13"></iconify-icon>
                    Red Flag Warnings:
                  </h5>
                  <p className="text-ink text-[11px] leading-relaxed">{selectedPreset.redFlags}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-cream border-t border-ink/10 flex items-center justify-between">
              <span className="text-[11px] text-inkmute">
                Guideline dosages based on standard National Health Mission rural clinical protocols.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyPreset(selectedPreset)}
                  className="pill pill-ink px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                >
                  <iconify-icon
                    icon={presetCopied ? 'ph:check-bold' : 'ph:copy-bold'}
                    width="14"
                    height="14"
                  ></iconify-icon>
                  <span>{presetCopied ? 'Copied to Clipboard!' : 'Copy Regimen Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPresetsModal(false)}
                  className="pill pill-ghost-ink px-3.5 py-2 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
