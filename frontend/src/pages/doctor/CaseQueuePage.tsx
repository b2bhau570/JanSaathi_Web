import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCases } from '../../api/doctorApi';

export const CaseQueuePage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const [cases, setCases] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '');

  const searchRef = React.useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const fetchCases = React.useCallback(async (overrideSearch?: string) => {
    setIsLoading(true);
    try {
      const q = (overrideSearch !== undefined ? overrideSearch : searchRef.current).trim();
      const data = await getCases({
        page,
        page_size: pageSize,
        search: q || undefined,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
      } as any);

      setCases(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.pages || 1);
    } catch (err) {
      console.error('Failed to fetch cases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, statusFilter, priorityFilter]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void fetchCases();
    });
    return () => {
      active = false;
    };
  }, [fetchCases]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchCases(search);
  };

  const priorityBadge = (priority: string) => {
    switch (priority) {
      case 'emergency':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-magenta/15 text-magentadeep border border-magenta/25 animate-pulse">Emergency</span>;
      case 'urgent':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-ink/8 text-ink border border-ink/15">Urgent</span>;
      case 'elevated':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-cream text-inkmute border border-ink/10">Elevated</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase bg-cream text-inkmute border border-ink/8">Normal</span>;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/6 text-ink border border-ink/10">New Intake</span>;
      case 'under_review':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-magenta/8 text-magenta border border-magenta/15">Under Review</span>;
      case 'response_submitted':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-magenta/10 text-magenta border border-magenta/20">Response Given</span>;
      case 'closed':
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cream text-inkmute border border-ink/8">Closed</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-cream text-inkmute border border-ink/8">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">Clinical Case Queue</h1>
          <p className="text-xs text-inkmute mt-1">
            Total active cases: <strong>{total}</strong> • Page {page} of {totalPages}
          </p>
        </div>

        <button
          onClick={() => {
            if (cases.length === 0) {
              alert('No cases available to export.');
              return;
            }
            const csvRows = [
              ['Case ID', 'Patient Name', 'Age', 'Gender', 'Contact', 'Language', 'Chief Complaint', 'Priority', 'Status', 'Registered At'],
              ...cases.map((c) => [
                c.public_case_id,
                `"${(c.patient_name || '').replace(/"/g, '""')}"`,
                c.patient_age || '',
                c.patient_gender || '',
                `"${c.patient_contact || ''}"`,
                c.preferred_language || 'en',
                `"${(c.chief_complaint || '').replace(/"/g, '""')}"`,
                c.priority,
                c.status,
                c.created_at,
              ]),
            ];
            const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `JanSaathi-CaseQueue-${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          className="pill pill-secondary px-3.5 py-2 text-xs font-semibold self-start sm:self-auto flex items-center gap-1.5"
          title="Export current page to CSV spreadsheet"
        >
          <iconify-icon icon="ph:file-csv-bold" width="14" height="14"></iconify-icon>
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <iconify-icon icon="ph:magnifying-glass-bold" width="16" height="16" style={{ color: '#5a544a', position: 'absolute', left: '12px', top: '11px' } as any}></iconify-icon>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Case ID, patient name, or complaint..."
            className="w-full border border-ink/14 rounded-xl pl-9 pr-3.5 py-2 text-xs md:text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all placeholder:text-inkmute/50"
          />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-ink/14 rounded-xl px-3 py-2 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
          >
            <option value="">All Statuses</option>
            <option value="submitted">New Intake (Submitted)</option>
            <option value="under_review">Under Review</option>
            <option value="response_submitted">Response Submitted</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="border border-ink/14 rounded-xl px-3 py-2 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
          >
            <option value="">All Priorities</option>
            <option value="emergency">Emergency Only</option>
            <option value="urgent">Urgent Only</option>
            <option value="elevated">Elevated</option>
            <option value="normal">Normal</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
      <div className="bg-creamdeep rounded-2xl border border-ink/8 overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-inkmute">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="py-12 text-center text-xs text-inkmute">
            No patient cases found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-cream/50 text-inkmute font-semibold border-b border-ink/10">
                <tr>
                  <th className="p-3">Case ID</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Language</th>
                  <th className="p-3">Chief Complaint</th>
                  <th className="p-3">Vitals Snapshot</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {cases.map((c) => {
                  const vitals = (c as any).latest_vitals;
                  const hr = vitals?.['heart_rate']?.value;
                  const spo2 = vitals?.['spo2']?.value;
                  const temp = vitals?.['temperature']?.value;

                  const isSpo2Critical = spo2 !== undefined && spo2 < 92;
                  const isTempHigh = temp !== undefined && temp > 100.4;
                  const isHrAbnormal = hr !== undefined && (hr > 100 || hr < 55);

                  return (
                    <tr key={c.id || c.public_case_id} className="hover:bg-cream/60 transition-colors">
                      <td className="p-3 font-mono font-semibold text-ink">
                        {c.public_case_id}
                      </td>
                      <td className="p-3">
                        <strong className="text-ink block">{c.patient_name}</strong>
                        <span className="text-[11px] text-inkmute flex items-center gap-1">
                          <span>{c.patient_age}y, {c.patient_gender}</span>
                          {(c as any).patient_contact && (
                            <span className="text-[10px] font-mono text-inkmute/80">• {(c as any).patient_contact}</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-cream border border-ink/10 text-ink uppercase">
                          {c.preferred_language || 'en'}
                        </span>
                      </td>
                      <td className="p-3 max-w-sm truncate text-inkmute" title={c.chief_complaint}>
                        {c.chief_complaint}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {vitals && Object.keys(vitals).length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1 text-[10px] font-mono">
                            {hr !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${isHrAbnormal ? 'bg-red-50 text-red-700 border-red-300 font-bold' : 'bg-cream text-ink border-ink/10'}`}>
                                ❤️ {hr}
                              </span>
                            )}
                            {spo2 !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${isSpo2Critical ? 'bg-magenta/15 text-magenta border-magenta/40 font-bold animate-pulse' : 'bg-cream text-ink border-ink/10'}`}>
                                🫁 {spo2}%
                              </span>
                            )}
                            {temp !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${isTempHigh ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold' : 'bg-cream text-ink border-ink/10'}`}>
                                🌡️ {temp}°F
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-inkmute/50 italic">None</span>
                        )}
                      </td>
                      <td className="p-3">{priorityBadge(c.priority)}</td>
                      <td className="p-3">{statusBadge(c.status)}</td>
                      <td className="p-3 text-inkmute">
                        {new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          to={`/doctor/cases/${c.public_case_id || c.id}`}
                          className="pill pill-ink px-3 py-1.5 text-[11px]"
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

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-ink/10 flex items-center justify-between text-xs text-inkmute bg-cream/30">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 rounded-lg border border-ink/12 bg-cream hover:bg-creamdeep disabled:opacity-40 transition-colors"
              >
                <iconify-icon icon="ph:caret-left-bold" width="14" height="14"></iconify-icon>
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 rounded-lg border border-ink/12 bg-cream hover:bg-creamdeep disabled:opacity-40 transition-colors"
              >
                <iconify-icon icon="ph:caret-right-bold" width="14" height="14"></iconify-icon>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
