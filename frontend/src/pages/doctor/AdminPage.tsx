import React, { useEffect, useState } from 'react';
import { getAllDoctors, approveDoctor, suspendDoctor, rejectDoctor } from '../../api/adminApi';
import { getCases } from '../../api/doctorApi';
import client from '../../api/client';
import { useAuth } from '../../contexts/useAuth';
import { INITIAL_MEDICINE_CATALOG, type MedicalProduct } from '../../data/medicineCatalog';

export const AdminPage: React.FC = () => {
  const { doctor } = useAuth();

  const [activeTab, setActiveTab] = useState<'doctors' | 'inventory' | 'cases' | 'audit'>('doctors');

  // Doctors State
  const [doctors, setDoctors] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Hospital Cases State
  const [hospitalCases, setHospitalCases] = useState<any[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);

  // Medical Shop Inventory State (Local admin state initialized with catalog)
  const [inventory, setInventory] = useState<MedicalProduct[]>(() => {
    const saved = localStorage.getItem('jan_saathi_admin_inventory');
    return saved ? JSON.parse(saved) : INITIAL_MEDICINE_CATALOG;
  });

  // New Product Modal Form State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdGeneric, setNewProdGeneric] = useState('');
  const [newProdCategory, setNewProdCategory] = useState<MedicalProduct['category']>('Fever & Pain');
  const [newProdStrength, setNewProdStrength] = useState('');
  const [newProdDosage, setNewProdDosage] = useState<MedicalProduct['dosage_form']>('Tablet');
  const [newProdMrp, setNewProdMrp] = useState(50);
  const [newProdPrice, setNewProdPrice] = useState(15);
  const [newProdImage, setNewProdImage] = useState('');
  const [newProdStock, setNewProdStock] = useState(100);
  const [newProdDesc, setNewProdDesc] = useState('');

  const loadData = React.useCallback(async () => {
    if (!doctor?.is_admin) return;
    setIsLoading(true);
    try {
      const docs = await getAllDoctors();
      setDoctors(docs || []);

      const logsRes = await client.get('/admin/audit-logs');
      setAuditLogs(logsRes.data || []);

      setCasesLoading(true);
      const casesData = await getCases({ page: 1, page_size: 20 } as any);
      setHospitalCases(casesData.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setCasesLoading(false);
    }
  }, [doctor?.is_admin]);

  useEffect(() => {
    if (!doctor?.is_admin) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void loadData();
    });
    return () => {
      active = false;
    };
  }, [statusFilter, doctor?.is_admin, loadData]);

  const handleApprove = async (id: string) => {
    setActionInProgress(id);
    try {
      await approveDoctor(id);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to approve doctor.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSuspend = async (id: string) => {
    if (!confirm('Are you sure you want to suspend this doctor account?')) return;
    setActionInProgress(id);
    try {
      await suspendDoctor(id);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to suspend doctor.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Are you sure you want to reject this registration?')) return;
    setActionInProgress(id);
    try {
      await rejectDoctor(id);
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to reject registration.');
    } finally {
      setActionInProgress(null);
    }
  };

  // Inventory actions
  const toggleStock = (prodId: string) => {
    const updated = inventory.map((p) =>
      p.id === prodId ? { ...p, in_stock: !p.in_stock } : p
    );
    setInventory(updated);
    localStorage.setItem('jan_saathi_admin_inventory', JSON.stringify(updated));
  };

  const adjustStockCount = (prodId: string, delta: number) => {
    const updated = inventory.map((p) => {
      if (p.id === prodId) {
        const next = Math.max(0, p.stock_count + delta);
        return { ...p, stock_count: next, in_stock: next > 0 };
      }
      return p;
    });
    setInventory(updated);
    localStorage.setItem('jan_saathi_admin_inventory', JSON.stringify(updated));
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdGeneric.trim()) {
      alert('Please fill out required product name and generic formula.');
      return;
    }
    const discount = Math.round(((newProdMrp - newProdPrice) / newProdMrp) * 100);
    const item: MedicalProduct = {
      id: `med-${Date.now()}`,
      name: newProdName.trim(),
      generic_name: newProdGeneric.trim(),
      category: newProdCategory,
      strength: newProdStrength.trim() || 'Standard',
      dosage_form: newProdDosage,
      mrp: Number(newProdMrp),
      price: Number(newProdPrice),
      discount_pct: Math.max(0, discount),
      image:
        newProdImage.trim() ||
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=80',
      in_stock: newProdStock > 0,
      stock_count: Number(newProdStock),
      manufacturer: 'Jan Aushadhi Bureau / State Medical Supply',
      description: newProdDesc.trim() || 'Quality generic medicine certified under PMBJP.',
      usage_instructions: 'Take as directed by treating physician.',
      prescription_required: newProdCategory === 'Antibiotics & Infection' || newProdCategory === 'Chronic Care (BP & Sugar)',
    };

    const updated = [item, ...inventory];
    setInventory(updated);
    localStorage.setItem('jan_saathi_admin_inventory', JSON.stringify(updated));
    setShowAddProductModal(false);
    // Reset form
    setNewProdName('');
    setNewProdGeneric('');
    setNewProdImage('');
    setNewProdDesc('');
  };

  if (!doctor?.is_admin) {
    return (
      <div className="bg-magenta/10 border border-magenta/25 rounded-2xl p-8 text-center text-ink space-y-3">
        <div className="w-12 h-12 rounded-full bg-magenta/15 flex items-center justify-center mx-auto text-magenta">
          <iconify-icon icon="ph:shield-warning-fill" width="24" height="24"></iconify-icon>
        </div>
        <h2 className="font-serif opsz-72 text-lg font-semibold text-ink">Access Denied</h2>
        <p className="text-xs text-inkmute">
          Administrator privileges are required to view this console. Please sign in with an administrator account.
        </p>
      </div>
    );
  }

  const filteredDoctors = statusFilter
    ? doctors.filter((d) => d.status === statusFilter)
    : doctors;

  const pendingDoctorsCount = doctors.filter((d) => d.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* ── Admin Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-creamdeep p-6 rounded-2xl border border-ink/8">
        <div>
          <span className="eyebrow text-magenta font-bold text-[10px]">Hospital Administration Console</span>
          <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink tracking-tight mt-0.5">
            Platform Master Controls
          </h1>
          <p className="text-xs text-inkmute mt-1">
            Supervise clinical accounts, manage Jan Aushadhi medical shop inventory, and inspect compliance audit trails.
          </p>
        </div>

        <button
          onClick={loadData}
          className="pill pill-ink px-4 py-2 text-xs font-semibold self-start sm:self-auto flex items-center gap-1.5"
        >
          <iconify-icon icon="ph:arrows-clockwise-bold" width="14" height="14"></iconify-icon>
          <span>Refresh All</span>
        </button>
      </div>

      {/* ── KPI Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-creamdeep p-4 rounded-2xl border border-ink/8 space-y-1">
          <div className="flex items-center justify-between text-inkmute text-[10px] font-bold uppercase tracking-wider">
            <span>Pending Doctors</span>
            <iconify-icon icon="ph:user-clock-bold" width="16" height="16" style={{ color: '#d6246e' }}></iconify-icon>
          </div>
          <div className="font-serif opsz-72 text-2xl font-bold text-magenta">{pendingDoctorsCount}</div>
          <span className="text-[10px] text-inkmute">Awaiting state license verification</span>
        </div>

        <div className="bg-creamdeep p-4 rounded-2xl border border-ink/8 space-y-1">
          <div className="flex items-center justify-between text-inkmute text-[10px] font-bold uppercase tracking-wider">
            <span>Total Clinicians</span>
            <iconify-icon icon="ph:stethoscope-bold" width="16" height="16"></iconify-icon>
          </div>
          <div className="font-serif opsz-72 text-2xl font-bold text-ink">{doctors.length}</div>
          <span className="text-[10px] text-inkmute">Registered physician accounts</span>
        </div>

        <div className="bg-creamdeep p-4 rounded-2xl border border-ink/8 space-y-1">
          <div className="flex items-center justify-between text-inkmute text-[10px] font-bold uppercase tracking-wider">
            <span>Shop Catalog Items</span>
            <iconify-icon icon="ph:pill-bold" width="16" height="16"></iconify-icon>
          </div>
          <div className="font-serif opsz-72 text-2xl font-bold text-ink">{inventory.length}</div>
          <span className="text-[10px] text-inkmute">Active pharmaceuticals & devices</span>
        </div>

        <div className="bg-creamdeep p-4 rounded-2xl border border-ink/8 space-y-1">
          <div className="flex items-center justify-between text-inkmute text-[10px] font-bold uppercase tracking-wider">
            <span>Security Audit Events</span>
            <iconify-icon icon="ph:shield-check-bold" width="16" height="16"></iconify-icon>
          </div>
          <div className="font-serif opsz-72 text-2xl font-bold text-ink">{auditLogs.length}</div>
          <span className="text-[10px] text-inkmute">Logged system transactions</span>
        </div>
      </div>

      {/* ── Main Tab Navigation ── */}
      <div className="border-b border-ink/10 flex flex-wrap gap-2 text-xs font-semibold">
        {[
          { id: 'doctors', label: `Doctor Verifications (${pendingDoctorsCount ? `${pendingDoctorsCount} Pending` : doctors.length})`, icon: 'ph:users-bold' },
          { id: 'inventory', label: `Medical Shop Inventory (${inventory.length})`, icon: 'ph:shopping-bag-bold' },
          { id: 'cases', label: `Hospital Cases Supervision (${hospitalCases.length})`, icon: 'ph:clipboard-text-bold' },
          { id: 'audit', label: `Security Audit Trail (${auditLogs.length})`, icon: 'ph:shield-bold' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl transition-all ${
                isActive
                  ? 'bg-creamdeep border-t border-x border-ink/10 text-magenta font-bold'
                  : 'text-inkmute hover:text-ink'
              }`}
            >
              <iconify-icon icon={tab.icon} width="15" height="15"></iconify-icon>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1: Doctor Accounts Management ── */}
      {activeTab === 'doctors' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="font-serif opsz-72 text-base font-semibold text-ink">
              Physician Credentials & Registration Queue
            </h2>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-ink/14 rounded-xl px-3 py-1.5 text-xs bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending Verification</option>
              <option value="approved">Approved & Active</option>
              <option value="suspended">Suspended</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-inkmute">Loading clinician accounts...</div>
          ) : filteredDoctors.length === 0 ? (
            <div className="py-12 text-center text-xs text-inkmute">No clinician accounts match filter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-cream rounded-xl border border-ink/8">
                <thead className="bg-creamdeep text-inkmute font-semibold border-b border-ink/10">
                  <tr>
                    <th className="p-3">Doctor Name</th>
                    <th className="p-3">Council Reg No & Authority</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8">
                  {filteredDoctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-creamdeep/60 transition-colors">
                      <td className="p-3">
                        <strong className="text-ink block text-xs">{doc.full_name}</strong>
                        <span className="text-[11px] text-inkmute">{doc.email}</span>
                      </td>
                      <td className="p-3 text-inkmute">
                        <div className="text-ink font-mono font-medium">{doc.registration_number || '—'}</div>
                        <span className="text-[10px] text-inkmute/70">{doc.issuing_authority || '—'}</span>
                      </td>
                      <td className="p-3 font-mono text-ink text-[11px]">{doc.phone || '—'}</td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                            doc.status === 'approved'
                              ? 'bg-magenta/10 text-magenta border-magenta/20'
                              : doc.status === 'pending'
                              ? 'bg-ink/8 text-ink border-ink/15 animate-pulse'
                              : 'bg-magenta/15 text-magentadeep border-magenta/25'
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="p-3 text-inkmute">
                        {doc.is_admin ? (
                          <span className="font-bold text-magenta text-[11px]">Administrator</span>
                        ) : (
                          <span className="text-[11px]">Attending Doctor</span>
                        )}
                      </td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        {doc.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(doc.id)}
                              disabled={actionInProgress === doc.id}
                              className="pill pill-ink px-3 py-1 text-[11px]"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(doc.id)}
                              disabled={actionInProgress === doc.id}
                              className="pill pill-ghost-ink px-3 py-1 text-[11px] text-magenta hover:bg-magenta/10"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {doc.status === 'approved' && !doc.is_admin && (
                          <button
                            onClick={() => handleSuspend(doc.id)}
                            disabled={actionInProgress === doc.id}
                            className="pill pill-ghost-ink px-3 py-1 text-[11px] text-inkmute hover:text-magenta"
                          >
                            Suspend
                          </button>
                        )}

                        {doc.status === 'suspended' && (
                          <button
                            onClick={() => handleApprove(doc.id)}
                            disabled={actionInProgress === doc.id}
                            className="pill pill-ink px-3 py-1 text-[11px]"
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Medical Shop Inventory & Catalog Controls ── */}
      {activeTab === 'inventory' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-serif opsz-72 text-base font-semibold text-ink">
                Medical Store Product Catalog & Inventory Controls
              </h2>
              <p className="text-xs text-inkmute">
                Manage stock counts, subsidized pricing, and catalog listings available in the Medical Shop & Doctor Checkup page.
              </p>
            </div>

            <button
              onClick={() => setShowAddProductModal(true)}
              className="pill pill-magenta px-4 py-2 text-xs font-bold self-start sm:self-auto flex items-center gap-1.5 shadow-sm"
            >
              <iconify-icon icon="ph:plus-bold" width="14" height="14"></iconify-icon>
              <span>Add New Medicine Product</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs bg-cream rounded-xl border border-ink/8">
              <thead className="bg-creamdeep text-inkmute font-semibold border-b border-ink/10">
                <tr>
                  <th className="p-3">Photo & Product</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Form & Strength</th>
                  <th className="p-3">Pricing (Jan Aushadhi / MRP)</th>
                  <th className="p-3">Stock Units</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-creamdeep/60 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-cover border border-ink/8 shrink-0"
                        />
                        <div className="min-w-0">
                          <strong className="text-ink font-semibold block text-xs truncate max-w-[200px]" title={item.name}>
                            {item.name}
                          </strong>
                          <span className="text-[10px] text-inkmute block truncate max-w-[200px]" title={item.generic_name}>
                            {item.generic_name}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="p-3">
                      <span className="bg-ink/6 text-ink px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
                        {item.category}
                      </span>
                    </td>

                    <td className="p-3">
                      <span className="font-mono text-ink text-xs">{item.strength}</span>
                      <span className="text-[10px] text-inkmute block">{item.dosage_form}</span>
                    </td>

                    <td className="p-3">
                      <span className="font-bold text-magenta text-xs">₹{item.price}</span>{' '}
                      <span className="text-inkmute line-through text-[10px]">₹{item.mrp}</span>
                      <span className="text-green-700 font-bold text-[9px] block">Save {item.discount_pct}%</span>
                    </td>

                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-mono">
                        <button
                          onClick={() => adjustStockCount(item.id, -10)}
                          className="w-5 h-5 rounded bg-creamdeep border border-ink/10 flex items-center justify-center font-bold text-ink hover:text-magenta"
                        >
                          -
                        </button>
                        <span className="font-bold text-xs px-1 text-ink">{item.stock_count}</span>
                        <button
                          onClick={() => adjustStockCount(item.id, 10)}
                          className="w-5 h-5 rounded bg-creamdeep border border-ink/10 flex items-center justify-center font-bold text-ink hover:text-magenta"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          item.in_stock
                            ? 'bg-green-500/10 text-green-700 border border-green-500/20'
                            : 'bg-red-500/10 text-red-700 border border-red-500/20'
                        }`}
                      >
                        {item.in_stock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </td>

                    <td className="p-3 text-right">
                      <button
                        onClick={() => toggleStock(item.id)}
                        className="pill pill-secondary px-3 py-1 text-[11px] font-semibold"
                      >
                        {item.in_stock ? 'Mark Out of Stock' : 'Mark In Stock'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: Hospital Cases Supervision ── */}
      {activeTab === 'cases' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif opsz-72 text-base font-semibold text-ink">
              Hospital Clinical Case Registry Supervision
            </h2>
            <span className="text-xs text-inkmute">Showing recent 20 cases</span>
          </div>

          {casesLoading ? (
            <div className="py-12 text-center text-xs text-inkmute">Loading hospital cases...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs bg-cream rounded-xl border border-ink/8">
                <thead className="bg-creamdeep text-inkmute font-semibold border-b border-ink/10">
                  <tr>
                    <th className="p-3">Case ID</th>
                    <th className="p-3">Patient</th>
                    <th className="p-3">Chief Complaint</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Registered At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8">
                  {hospitalCases.map((c) => (
                    <tr key={c.id || c.public_case_id} className="hover:bg-creamdeep/60">
                      <td className="p-3 font-mono font-bold text-ink">{c.public_case_id}</td>
                      <td className="p-3">
                        <strong className="text-ink">{c.patient_name}</strong>
                        <span className="text-[11px] text-inkmute block">
                          {c.patient_age}y, {c.patient_gender}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs truncate text-inkmute" title={c.chief_complaint}>
                        {c.chief_complaint}
                      </td>
                      <td className="p-3">
                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded-full bg-creamdeep border border-ink/10 text-ink">
                          {c.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] font-medium text-magenta">{c.status}</span>
                      </td>
                      <td className="p-3 text-inkmute text-[11px]">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 4: Security Audit Trail ── */}
      {activeTab === 'audit' && (
        <div className="bg-creamdeep rounded-2xl border border-ink/8 p-5 space-y-4">
          <h2 className="font-serif opsz-72 text-base font-semibold text-ink">
            Immutable Security & Clinical Access Trail
          </h2>

          {auditLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-inkmute">No audit logs recorded yet.</div>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-[11px] bg-cream rounded-xl border border-ink/8">
                <thead className="bg-creamdeep text-inkmute font-semibold sticky top-0 border-b border-ink/10">
                  <tr>
                    <th className="p-2.5">Action</th>
                    <th className="p-2.5">Actor Type</th>
                    <th className="p-2.5">Target Resource</th>
                    <th className="p-2.5">Details</th>
                    <th className="p-2.5">IP Address</th>
                    <th className="p-2.5">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-creamdeep/60">
                      <td className="p-2.5 font-bold text-ink">{log.action}</td>
                      <td className="p-2.5 text-inkmute">{log.actor_type}</td>
                      <td className="p-2.5 text-inkmute">{log.resource_type || '—'}</td>
                      <td className="p-2.5 text-inkmute text-[10px] max-w-xs truncate">{log.details || '—'}</td>
                      <td className="p-2.5 text-inkmute/70">{log.ip_address || 'local'}</td>
                      <td className="p-2.5 text-inkmute/70">{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Add New Product Modal ── */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-creamdeep rounded-3xl shadow-2xl max-w-lg w-full border border-ink/10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-ink text-cream p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-magenta flex items-center justify-center">
                  <iconify-icon icon="ph:plus-bold" width="16" height="16"></iconify-icon>
                </div>
                <h3 className="font-serif opsz-72 text-sm font-semibold">
                  Add New Medical Shop Product
                </h3>
              </div>
              <button
                onClick={() => setShowAddProductModal(false)}
                className="text-cream/70 hover:text-cream p-1.5 rounded-lg hover:bg-cream/10"
              >
                <iconify-icon icon="ph:x-bold" width="18" height="18"></iconify-icon>
              </button>
            </div>

            <form onSubmit={handleAddProduct} className="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
              <div>
                <label className="font-semibold text-ink block mb-1">
                  Product Commercial Name <span className="text-magenta">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="e.g. Paracetamol 650mg Tablets"
                  className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">
                  Active Generic Salt / Chemical Formula <span className="text-magenta">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newProdGeneric}
                  onChange={(e) => setNewProdGeneric(e.target.value)}
                  placeholder="e.g. Paracetamol IP 650mg"
                  className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-ink block mb-1">Category:</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value as any)}
                    className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  >
                    <option value="Fever & Pain">Fever & Pain</option>
                    <option value="Antibiotics & Infection">Antibiotics & Infection</option>
                    <option value="Digestion & ORS">Digestion & ORS</option>
                    <option value="Chronic Care (BP & Sugar)">Chronic Care (BP & Sugar)</option>
                    <option value="First Aid & Devices">First Aid & Devices</option>
                    <option value="Vitamins & Immunity">Vitamins & Immunity</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-ink block mb-1">Dosage Form:</label>
                  <select
                    value={newProdDosage}
                    onChange={(e) => setNewProdDosage(e.target.value as any)}
                    className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  >
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Sachet">Sachet</option>
                    <option value="Device">Device</option>
                    <option value="Ointment">Ointment</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-ink block mb-1">Strength:</label>
                  <input
                    type="text"
                    value={newProdStrength}
                    onChange={(e) => setNewProdStrength(e.target.value)}
                    placeholder="e.g. 650mg"
                    className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  />
                </div>
                <div>
                  <label className="font-semibold text-ink block mb-1">Market MRP (₹):</label>
                  <input
                    type="number"
                    min="1"
                    value={newProdMrp}
                    onChange={(e) => setNewProdMrp(Number(e.target.value))}
                    className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  />
                </div>
                <div>
                  <label className="font-semibold text-ink block mb-1">Jan Aushadhi (₹):</label>
                  <input
                    type="number"
                    min="1"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(Number(e.target.value))}
                    className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">
                  Product Image URL (Unsplash or Packaging Photo):
                </label>
                <input
                  type="url"
                  value={newProdImage}
                  onChange={(e) => setNewProdImage(e.target.value)}
                  placeholder="https://images.unsplash.com/photo-..."
                  className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Initial Stock Units:</label>
                <input
                  type="number"
                  min="0"
                  value={newProdStock}
                  onChange={(e) => setNewProdStock(Number(e.target.value))}
                  className="w-full border border-ink/14 rounded-xl px-3 py-2 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Clinical Description:</label>
                <textarea
                  rows={2}
                  value={newProdDesc}
                  onChange={(e) => setNewProdDesc(e.target.value)}
                  placeholder="Usage indications, therapeutic class, etc."
                  className="w-full border border-ink/14 rounded-xl p-2.5 bg-cream text-ink focus:ring-2 focus:ring-magenta/20 focus:border-magenta"
                />
              </div>

              <div className="pt-3 border-t border-ink/10 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="pill pill-ghost-ink px-4 py-2"
                >
                  Cancel
                </button>
                <button type="submit" className="pill pill-magenta px-5 py-2 font-bold">
                  Add to Store Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
