'use client';

import React, { useState } from 'react';
import { 
  CreditCard, 
  Users, 
  Clock, 
  History, 
  Settings, 
  FileText, 
  FileCheck, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle,
  Download,
  Plus,
  Send,
  Printer,
  TrendingUp,
  Fingerprint,
  Camera,
  Layers,
  ArrowRightLeft
} from 'lucide-react';

interface PayrollViewProps {
  onNavigateSection?: (section: any) => void;
}

export const PayrollView: React.FC<PayrollViewProps> = ({ onNavigateSection }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'timesheets' | 'transactions' | 'taxes'>('dashboard');

  // Real staff data from /api/admin/payroll (was fake employees with fake bank numbers)
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/admin/payroll?days=30', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setError(d.error); return; }
        // Map API shape to UI shape (no bank numbers — API doesn't return them)
        const mapped = (d.staff || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          role: s.role || (s.isGroomer ? 'Groomer' : 'Staff'),
          class: s.isGroomer ? 'Groomer' : 'Staff',
          baseWage: s.hourlyRate != null ? Number(s.hourlyRate) : 0,
          payType: s.payType || 'hourly',
          salaryAmount: s.salaryAmount != null ? Number(s.salaryAmount) : 0,
          salaryPeriod: s.salaryPeriod || 'annual',
          // Commission rate lives on the staff profile (a percent — 50 means
          // 50%). Null until a manager sets it; the UI shows "Not set".
          commissionRate: s.commissionRate == null ? null : Number(s.commissionRate),
          otMultiplier: 1.5,
          w4Status: '—',
          account: '—',
          routing: '—',
          status: s.isActive ? 'ACTIVE' : 'INACTIVE',
          ytdGross: s.grossRevenue || 0,
          ytdNet: s.netPay || 0,
          ytdTax: 0,
          regHours: 0,
          otHours: 0,
          commissionAmt: s.commissionOwed || 0,
          tipsAmt: s.tipsEarned || 0,
          appointmentCount: s.appointmentCount || 0,
        }));
        setEmployeesList(mapped);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const [selectedEmpId, setSelectedEmployeeId] = useState<string | null>(null);
  const [filterClass, setFilterFilterClass] = useState<string>('ALL');

  // Add Employee modal state
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [newEmpForm, setNewEmpForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', role: 'Canine Stylist',
    is_service_staff: true, hire_date: '', pay_type: 'hourly', hourly_rate: '', salary_amount: '',
    salary_period: 'annual', commission_rate: '',
    bank_routing_number: '', bank_account_number: '',
    bank_account_type: 'checking',
  });

  // Edit Compensation modal state (pay profile on the staff record)
  const [showEditComp, setShowEditComp] = useState(false);
  const [compForm, setCompForm] = useState({
    pay_type: 'hourly', hourly_rate: '', salary_amount: '',
    salary_period: 'annual', commission_rate: '',
    // Withholding profile (acct_payroll_employees.tax_info) — the inputs
    // the run engine computes tax_withheld from. taxLoaded gates sending
    // tax_profile on save, so a failed profile read can never wipe it.
    tax_federal_percent: '', tax_state_percent: '', tax_local_percent: '',
    tax_additional_amount: '',
  });
  const [taxLoaded, setTaxLoaded] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const [addEmpSaving, setAddEmpSaving] = useState(false);
  const [addEmpError, setAddEmpError] = useState<string | null>(null);

  const handleAddEmployee = async () => {
    if (!newEmpForm.first_name.trim() || !newEmpForm.last_name.trim()) {
      setAddEmpError('First and last name are required.');
      return;
    }
    setAddEmpSaving(true);
    setAddEmpError(null);
    try {
      const r = await fetch('/api/admin/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmpForm),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Failed to add employee');
      setShowAddEmployee(false);
      setNewEmpForm({
        first_name: '', last_name: '', email: '', phone: '', role: 'Canine Stylist',
        is_service_staff: true, hire_date: '', pay_type: 'hourly', hourly_rate: '', salary_amount: '',
        salary_period: 'annual', commission_rate: '',
        bank_routing_number: '', bank_account_number: '',
        bank_account_type: 'checking',
      });
      // Refresh the employee list
      window.location.reload();
    } catch (e) {
      setAddEmpError(e instanceof Error ? e.message : 'Failed to add employee');
    } finally {
      setAddEmpSaving(false);
    }
  };

  const openEditComp = () => {
    const e = selectedEmployee;
    if (!e?.id) return;
    setCompForm({
      pay_type: e.payType || 'hourly',
      hourly_rate: e.baseWage ? String(e.baseWage) : '',
      salary_amount: e.salaryAmount ? String(e.salaryAmount) : '',
      salary_period: e.salaryPeriod || 'annual',
      commission_rate: e.commissionRate == null ? '' : String(e.commissionRate),
      tax_federal_percent: '', tax_state_percent: '', tax_local_percent: '',
      tax_additional_amount: '',
    });
    setTaxLoaded(false);
    setCompError(null);
    setShowEditComp(true);
    // Prefill the recorded withholding profile (blank = none on file).
    fetch(`/api/admin/payroll/employees/${e.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        const tp = d.tax_profile;
        setTaxLoaded(true);
        if (tp) {
          setCompForm((f) => ({
            ...f,
            tax_federal_percent: tp.federal_percent != null ? String(tp.federal_percent) : '',
            tax_state_percent: tp.state_percent != null ? String(tp.state_percent) : '',
            tax_local_percent: tp.local_percent != null ? String(tp.local_percent) : '',
            tax_additional_amount: tp.additional_amount != null ? String(tp.additional_amount) : '',
          }));
        }
      })
      .catch(() => {});
  };

  const handleSaveComp = async () => {
    if (!selectedEmployee?.id) return;
    setCompSaving(true);
    setCompError(null);
    try {
      const { tax_federal_percent, tax_state_percent, tax_local_percent, tax_additional_amount, ...payFields } = compForm;
      const r = await fetch(`/api/admin/payroll/employees/${selectedEmployee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payFields,
          ...(taxLoaded ? {
            tax_profile: {
              federal_percent: tax_federal_percent === '' ? null : Number(tax_federal_percent),
              state_percent: tax_state_percent === '' ? null : Number(tax_state_percent),
              local_percent: tax_local_percent === '' ? null : Number(tax_local_percent),
              additional_amount: tax_additional_amount === '' ? null : Number(tax_additional_amount),
            },
          } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Failed to save compensation');
      const emp = d.employee;
      setEmployeesList((list) => list.map((e) => e.id === emp.id ? {
        ...e,
        payType: emp.pay_type,
        baseWage: emp.hourly_rate != null ? Number(emp.hourly_rate) : 0,
        salaryAmount: emp.salary_amount != null ? Number(emp.salary_amount) : 0,
        salaryPeriod: emp.salary_period || 'annual',
        commissionRate: emp.commission_rate != null ? Number(emp.commission_rate) : null,
      } : e));
      setShowEditComp(false);
    } catch (e) {
      setCompError(e instanceof Error ? e.message : 'Failed to save compensation');
    } finally {
      setCompSaving(false);
    }
  };

  // Timesheets State — fetched from /api/admin/payroll/timesheets
  const [timesheetPunches, setTimesheetPunches] = useState<any[]>([]);
  const [timesheetsLoading, setTimesheetsLoading] = useState(true);
  const [approvingTimesheets, setApprovingTimesheets] = useState(false);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/admin/payroll/timesheets?status=all', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) setTimesheetPunches(d.timesheets || []); })
      .catch(() => {})
      .finally(() => { if (alive) setTimesheetsLoading(false); });
    return () => { alive = false; };
  }, []);

  const handleBatchApproveTimesheets = async () => {
    const pendingIds = timesheetPunches.filter((t: any) => t.status === 'pending').map((t: any) => t.id);
    if (pendingIds.length === 0) return;
    setApprovingTimesheets(true);
    try {
      const r = await fetch('/api/admin/payroll/timesheets/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: pendingIds }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Approve failed');
      // Refresh list
      const r2 = await fetch('/api/admin/payroll/timesheets?status=all', { cache: 'no-store' });
      const d2 = await r2.json();
      setTimesheetPunches(d2.timesheets || []);
    } catch (e) {
      console.error('Batch approve failed:', e);
    } finally {
      setApprovingTimesheets(false);
    }
  };

  const [selectedPunchId, setSelectedPunchId] = useState<string | null>(null);

  const selectedEmployee = employeesList.find(e => e.id === selectedEmpId) || employeesList[0] || {
    id: '', name: '—', role: '—', class: '—', baseWage: 0, payType: 'hourly', salaryAmount: 0, salaryPeriod: 'annual', commissionRate: null,
    otMultiplier: 1, w4Status: '—', account: '—', routing: '—', status: '—',
    ytdGross: 0, ytdNet: 0, ytdTax: 0, regHours: 0, otHours: 0,
    commissionAmt: 0, tipsAmt: 0, appointmentCount: 0,
  };
  const selectedPunch = timesheetPunches.find(p => p.id === selectedPunchId) || null;

  // Dashboard run-preparation preview hours: APPROVED timesheets on file,
  // aggregated per employee (PTO folds into regular hours — the same
  // source and formula the run engine pays from). The /api/admin/payroll
  // payload carries no hours; the mapped regHours/otHours were hardcoded
  // 0, so the preview gross silently excluded every hourly wage.
  const approvedHoursByEmp = React.useMemo(() => {
    const m = new Map<string, { reg: number; ot: number }>();
    for (const t of timesheetPunches) {
      if (t.status !== 'approved') continue;
      const cur = m.get(t.employee_id) || { reg: 0, ot: 0 };
      cur.reg += Number(t.hours_regular || 0) + Number(t.hours_pto || 0);
      cur.ot += Number(t.hours_overtime || 0);
      m.set(t.employee_id, cur);
    }
    return m;
  }, [timesheetPunches]);
  const previewEmployees = employeesList.map((e) => {
    const h = approvedHoursByEmp.get(e.id);
    return h ? { ...e, regHours: h.reg, otHours: h.ot } : e;
  });

  // Helper calculations for active batch run
  const activeBatchHeadcount = previewEmployees.length;
  const activeBatchRegularHours = previewEmployees.reduce((sum, e) => sum + (e.regHours || 0), 0);
  const activeBatchOtHours = previewEmployees.reduce((sum, e) => sum + (e.otHours || 0), 0);
  const activeBatchCommission = previewEmployees.reduce((sum, e) => sum + (e.commissionAmt || 0), 0);
  const activeBatchTips = previewEmployees.reduce((sum, e) => sum + (e.tipsAmt || 0), 0);
  
  const calculateGross = (e: typeof employeesList[0]) => {
    const hourlyGross = (e.regHours * e.baseWage) + (e.otHours * e.baseWage * e.otMultiplier);
    return hourlyGross + e.commissionAmt + e.tipsAmt;
  };

  const calculateNet = (e: typeof employeesList[0]) => {
    // NO withholding engine exists in this app: payroll runs record
    // tax_withheld = 0 and net = gross. Never invent a withholding rate.
    return calculateGross(e);
  };

  const activeBatchGross = previewEmployees.reduce((sum, e) => sum + calculateGross(e), 0);
  const activeBatchNet = previewEmployees.reduce((sum, e) => sum + calculateNet(e), 0);
  const activeBatchTax = activeBatchGross - activeBatchNet;

  // SA-89 — Edit Timesheet: real edit through the finance quick action
  // (fin_edit_timesheet → payroll_timesheets, audited). The form edits the
  // selected timesheet's hours / notes / status; approval stamps
  // approved_at + approved_by server-side. 'processed' timesheets are
  // locked by the API (409) because a run was already computed from them.
  const [tsForm, setTsForm] = useState({ hours_regular: '', hours_overtime: '', hours_pto: '', hours_sick: '', notes: '', status: 'pending' });
  const [tsSaving, setTsSaving] = useState(false);
  const [tsError, setTsError] = useState<string | null>(null);
  const [tsNotice, setTsNotice] = useState<string | null>(null);

  const openTimesheetEditor = (t: any) => {
    setSelectedPunchId(t.id);
    setTsForm({
      hours_regular: String(t.hours_regular ?? ''),
      hours_overtime: String(t.hours_overtime ?? ''),
      hours_pto: String(t.hours_pto ?? ''),
      hours_sick: String(t.hours_sick ?? ''),
      notes: t.notes || '',
      status: t.status || 'pending',
    });
    setTsError(null); setTsNotice(null);
  };

  const refreshTimesheets = async () => {
    const r = await fetch('/api/admin/payroll/timesheets?status=all', { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    setTimesheetPunches(d.timesheets || []);
  };

  const handleSaveTimesheet = async () => {
    if (!selectedPunchId) return;
    setTsSaving(true); setTsError(null); setTsNotice(null);
    try {
      const payload: Record<string, unknown> = { timesheet_id: selectedPunchId, status: tsForm.status };
      for (const k of ['hours_regular', 'hours_overtime', 'hours_pto', 'hours_sick'] as const) {
        if (tsForm[k] !== '') payload[k] = Number(tsForm[k]);
      }
      if (tsForm.notes) payload.notes = tsForm.notes;
      const r = await fetch('/api/admin/finance/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fin_edit_timesheet', payload }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || 'Edit failed');
      setTsNotice('Timesheet saved — the change is in the audit log.');
      await refreshTimesheets();
    } catch (e) {
      setTsError(e instanceof Error ? e.message : 'Edit failed');
    } finally {
      setTsSaving(false);
    }
  };

  const [disbursing, setDisbursing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);

  // Pay-stub inspector (Transactions tab): the selected run's real
  // payroll_run_items via GET /api/admin/payroll/runs/[id]. A run's stubs
  // ARE its items — nothing is rendered that the run didn't record.
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<{ run: any; items: any[] } | null>(null);
  const [runDetailLoading, setRunDetailLoading] = useState(false);
  // Run lifecycle (BL-3): draft → approved → paid → posted (+ void from
  // draft), via PATCH /api/admin/payroll/runs/[id]. 'pay' runs the
  // disbursement gates + writes the quarter's 941 record; 'post' posts
  // the balanced JE and stamps journal_id (see lib/payroll/lifecycle.ts).
  const [runActionBusy, setRunActionBusy] = useState<string | null>(null);
  const [runActionError, setRunActionError] = useState<string | null>(null);
  const handleRunAction = async (action: string) => {
    if (!runDetail?.run?.id) return;
    if (action === 'void' && !window.confirm('Void this draft run? Its timesheets return to approved and its commission lines return to pending.')) return;
    setRunActionBusy(action);
    setRunActionError(null);
    try {
      const r = await fetch(`/api/admin/payroll/runs/${runDetail.run.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Transition failed');
      const r2 = await fetch(`/api/admin/payroll/runs/${runDetail.run.id}`, { cache: 'no-store' });
      const d2 = await r2.json();
      if (d2.ok) setRunDetail({ run: d2.run, items: d2.items || [] });
      const r3 = await fetch('/api/admin/payroll/runs', { cache: 'no-store' });
      const d3 = await r3.json();
      setPayrollRuns(d3.runs || []);
    } catch (e) {
      setRunActionError(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setRunActionBusy(null);
    }
  };
  React.useEffect(() => {
    if (!selectedRunId && payrollRuns.length > 0) setSelectedRunId(payrollRuns[0].id);
  }, [payrollRuns, selectedRunId]);
  React.useEffect(() => {
    if (!selectedRunId) { setRunDetail(null); return; }
    let alive = true;
    setRunDetailLoading(true);
    fetch(`/api/admin/payroll/runs/${selectedRunId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive && d.ok) setRunDetail({ run: d.run, items: d.items || [] }); })
      .catch(() => {})
      .finally(() => { if (alive) setRunDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedRunId]);

  React.useEffect(() => {
    fetch('/api/admin/payroll/runs', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const runs = d.runs || [];
        setPayrollRuns(runs);
        if (runs.length > 0) setLatestRunId(runs[0].id);
      })
      .catch(() => {});
  }, []);

  // SA-90 — View Tax Forms: real payroll_tax_forms rows via fin_view_tax_forms.
  const [taxForms, setTaxForms] = useState<any[] | null>(null);
  React.useEffect(() => {
    if (activeTab !== 'taxes' || taxForms !== null) return;
    fetch('/api/admin/finance/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fin_view_tax_forms', payload: {} }),
    })
      .then((r) => r.json())
      .then((d) => setTaxForms(d.taxForms || []))
      .catch(() => setTaxForms([]));
  }, [activeTab, taxForms]);

  const handleDownloadTaxForm = (f: any) => {
    // Download = the form's recorded data (payroll_tax_forms.payload plus
    // its filing metadata) as a JSON file. Nothing is generated or invented.
    const doc = { form_type: f.formType, year: f.year, quarter: f.quarter, status: f.status, filed_at: f.filedAt, payload: f.payload ?? null };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax-form-${f.formType}-${f.year}${f.quarter ? `-q${f.quarter}` : ''}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInitiateDisbursement = async () => {
    // Default to last 14 days as the pay period
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setDisbursing(true);
    setRunError(null); setRunNotice(null);
    try {
      const r = await fetch('/api/admin/payroll/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pay_period_start: fmt(start),
          pay_period_end: fmt(end),
          pay_date: fmt(end),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || 'Failed to create run');
      setLatestRunId(d.run.id);
      setSelectedRunId(d.run.id);
      if (d.summary?.note) setRunNotice(d.summary.note);
      else if ((d.summary?.employees ?? 0) === 0) setRunNotice('Run created with no payable lines — no approved timesheets or pending commissions fell in the last 14 days, so this draft totals $0.00.');
      // Refresh runs list
      const r2 = await fetch('/api/admin/payroll/runs', { cache: 'no-store' });
      const d2 = await r2.json();
      setPayrollRuns(d2.runs || []);
    } catch (e) {
      // Was console.error only — the operator saw a button that silently
      // did nothing. Surface it.
      setRunError(e instanceof Error ? e.message : 'Disbursement run failed');
    } finally {
      setDisbursing(false);
    }
  };

  const handleDownloadAch = () => {
    if (!latestRunId) return;
    window.open(`/api/admin/payroll/runs/${latestRunId}/ach`, '_blank');
  };

  const handleExportGlCsv = () => {
    if (payrollRuns.length === 0) return;
    const header = "Run Number,Period Start,Period End,Pay Date,Status,Gross Wages,Tax Withheld,Net Paid,Employer Taxes\n";
    const rows = payrollRuns.map((r: any) =>
      [r.number, r.pay_period_start, r.pay_period_end, r.pay_date, r.status, r.gross_wages, r.tax_withheld, r.net_paid, r.employer_taxes]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="flex flex-col w-full text-foreground bg-card select-text text-[12px]">
      {/* CONTEXT STRIP */}
      <div className="w-full bg-muted/40 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-black inline-block"></span>
          <span className="font-medium text-[11px] text-muted-foreground">
            Payroll
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] uppercase text-muted-foreground">
          <span>RUNS ON RECORD: <strong className="text-foreground">{payrollRuns.length}</strong></span>
          <span>|</span>
          <span>LATEST RUN: <strong className="text-foreground">{payrollRuns[0] ? `${payrollRuns[0].number} · ${String(payrollRuns[0].status).toUpperCase()} · ${payrollRuns[0].pay_date}` : 'NONE YET'}</strong></span>
        </div>
      </div>

      {/* SUB NAVIGATION TABS */}
      <div className="w-full bg-card border-b border-border flex overflow-x-auto shrink-0 select-none">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2.5 border-r border-border flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'dashboard' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
          }`}
        >
          <span>[01]</span>
          <span>PAYROLL DASHBOARD</span>
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2.5 border-r border-border flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'employees' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
          }`}
        >
          <span>[02]</span>
          <span>EMPLOYEES &amp; DIRECTORY</span>
        </button>
        <button
          onClick={() => setActiveTab('timesheets')}
          className={`px-4 py-2.5 border-r border-border flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'timesheets' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
          }`}
        >
          <span>[03]</span>
          <span>TIMESHEETS &amp; RECONCILIATION</span>
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2.5 border-r border-border flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'transactions' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
          }`}
        >
          <span>[04]</span>
          <span>TRANSACTIONS &amp; RUNS</span>
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`px-4 py-2.5 border-r border-border flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'taxes' ? 'bg-primary text-primary-foreground font-semibold' : 'bg-card text-foreground hover:bg-muted/40'
          }`}
        >
          <span>[05]</span>
          <span>PAYROLL TAXES &amp; STATUTORY</span>
        </button>
      </div>

      {/* VIEW: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="flex flex-col w-full animate-fade-in">
          {/* HEADER ACTION BANNER */}
          <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">SEC:3.11 // DISBURSEMENT PROTOCOL &amp; CYCLES</div>
              <h1 className="text-sm font-semibold uppercase mt-0.5">3.11 PAYROLL // EXECUTIVE DASHBOARD &amp; DISBURSEMENT CYCLES</h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleInitiateDisbursement}
                disabled={disbursing}
                className="bg-primary text-primary-foreground hover:bg-primary/90 border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer disabled:opacity-50"
              >
                {disbursing ? 'CREATING RUN…' : '+ INITIATE DISBURSEMENT RUN'}
              </button>
              <button 
                onClick={handleDownloadAch}
                disabled={!latestRunId}
                className="bg-card text-foreground hover:bg-muted/40 border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer disabled:opacity-50"
                title={latestRunId ? `Download NACHA file for run` : 'No payroll run yet — initiate a disbursement first'}
              >
                DOWNLOAD ACH BATCH FILE
              </button>
            </div>
          </div>

          {(runError || runNotice) && (
            <div className={`px-4 py-2 border-b border-border text-[11px] font-semibold ${runError ? 'text-destructive bg-destructive/5' : 'text-muted-foreground bg-muted/30'}`}>
              {runError ? `RUN FAILED: ${runError}` : runNotice}
            </div>
          )}

          {/* SUMMARY METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-4 border-b border-border divide-y md:divide-y-0 md:divide-x divide-border bg-card">
            <div className="p-4 flex flex-col justify-between">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase">METRIC:01 // LATEST PAYROLL RUN</div>
              <div className="my-2">
                <div className="text-lg font-semibold tracking-tight">{payrollRuns[0]?.pay_date || '—'}</div>
                <div className="text-[10px] text-muted-foreground font-sans uppercase font-semibold mt-1">[{payrollRuns[0] ? `${payrollRuns[0].number} · ${String(payrollRuns[0].status).toUpperCase()}` : 'NO RUNS YET'}]</div>
              </div>
            </div>
            <div className="p-4 flex flex-col justify-between">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase">METRIC:02 // GROSS PAYROLL</div>
              <div className="my-2">
                <div className="text-lg font-semibold tracking-tight">${activeBatchGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] text-muted-foreground font-sans uppercase font-semibold mt-1">[{activeBatchHeadcount} STAFF ON FILE]</div>
              </div>
            </div>
            <div className="p-4 flex flex-col justify-between">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase">METRIC:03 // NET CASH REQUIREMENT</div>
              <div className="my-2">
                <div className="text-lg font-semibold tracking-tight">${activeBatchNet.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] text-muted-foreground font-sans uppercase font-semibold mt-1">[TAX WITHHELD: $0.00 — NO WITHHOLDING ENGINE]</div>
              </div>
            </div>
            <div className="p-4 bg-muted/30 flex flex-col justify-between">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase">METRIC:04 // COMMISSION &amp; TIPS POOL</div>
              <div className="my-2">
                <div className="text-lg font-semibold tracking-tight">${(activeBatchCommission + activeBatchTips).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="text-[10px] text-muted-foreground font-sans uppercase font-semibold mt-1">[COMM: ${activeBatchCommission} | TIPS: ${activeBatchTips}]</div>
              </div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Table Area (8 Cols) */}
            <div className="lg:col-span-8 border-b lg: lg:border-r border-border flex flex-col">
              <div className="p-2.5 border-b border-border bg-muted/30 flex items-center justify-between text-[10px]">
                <span className="font-semibold">{payrollRuns[0] ? `LATEST RUN ${payrollRuns[0].number} // ${payrollRuns[0].pay_period_start} → ${payrollRuns[0].pay_period_end}` : 'RUN PREPARATION // NO RUNS YET'}</span>
                <span className="border border-border px-1.5 py-0.5 bg-card text-[9px] font-semibold">STATUS: {payrollRuns[0] ? String(payrollRuns[0].status).toUpperCase() : '—'}</span>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-[11px] border-collapse min-w-[650px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground bg-card font-semibold uppercase text-[10px]">
                      <th className="p-2 border-r border-border text-center w-8">
                        <input type="checkbox" defaultChecked className="h-3 w-3 border-border text-foreground" />
                      </th>
                      <th className="p-2 border-r border-border">EMP ID</th>
                      <th className="p-2 border-r border-border">EMPLOYEE / ROLE</th>
                      <th className="p-2 border-r border-border">CLASS</th>
                      <th className="p-2 border-r border-border text-right">REG HR</th>
                      <th className="p-2 border-r border-border text-right">OT HR</th>
                      <th className="p-2 border-r border-border text-right">COMM</th>
                      <th className="p-2 border-r border-border text-right">TIPS</th>
                      <th className="p-2 border-r border-border text-right">GROSS</th>
                      <th className="p-2 border-r border-border text-right">NET</th>
                      <th className="p-2 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {previewEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-muted/30">
                        <td className="p-2 border-r border-border text-center">
                          <input type="checkbox" defaultChecked className="h-3 w-3 border-border text-foreground" />
                        </td>
                        <td className="p-2 border-r border-border font-semibold tabular-nums">{emp.id}</td>
                        <td className="p-2 border-r border-border whitespace-nowrap">
                          <div className="font-semibold">{emp.name}</div>
                          <div className="text-[9px] text-muted-foreground uppercase">{emp.role}</div>
                        </td>
                        <td className="p-2 border-r border-border">{emp.class}</td>
                        <td className="p-2 border-r border-border text-right">{(emp.payType === 'salary' || emp.payType === 'salary_plus_commission') ? '--' : emp.regHours}</td>
                        <td className="p-2 border-r border-border text-right">{(emp.payType === 'salary' || emp.payType === 'salary_plus_commission') ? '--' : emp.otHours}</td>
                        <td className="p-2 border-r border-border text-right">${emp.commissionAmt.toFixed(2)}</td>
                        <td className="p-2 border-r border-border text-right">${emp.tipsAmt.toFixed(2)}</td>
                        <td className="p-2 border-r border-border text-right font-semibold">${calculateGross(emp).toFixed(2)}</td>
                        <td className="p-2 border-r border-border text-right font-semibold text-foreground">${calculateNet(emp).toFixed(2)}</td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <span className="bg-muted/40 text-foreground px-1.5 py-0.5 border border-border text-[9px] font-semibold">READY</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold uppercase text-[10px]">
                      <td className="p-2 border-r border-border text-center">-</td>
                      <td className="p-2 border-r border-border" colSpan={3}>AGGREGATE PREVIEW TOTALS ({previewEmployees.length} STAFF · HOURS FROM APPROVED TIMESHEETS ON FILE)</td>
                      <td className="p-2 border-r border-border text-right">{activeBatchRegularHours}h</td>
                      <td className="p-2 border-r border-border text-right">{activeBatchOtHours}h</td>
                      <td className="p-2 border-r border-border text-right">${activeBatchCommission.toFixed(2)}</td>
                      <td className="p-2 border-r border-border text-right">${activeBatchTips.toFixed(2)}</td>
                      <td className="p-2 border-r border-border text-right">${activeBatchGross.toFixed(2)}</td>
                      <td className="p-2 border-r border-border text-right underline decoration-double">${activeBatchNet.toFixed(2)}</td>
                      <td className="p-2 text-center">PREVIEW</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Sidebar Inspector (4 Cols) */}
            <div className="lg:col-span-4 p-4 space-y-4 bg-card">
              {/* Source Liquidity — payroll is funded from the tenant's
                  Stripe Connect bank account. Its balance lives in Stripe,
                  not in this app, so no balance is shown here. */}
              <div className="border border-border bg-card">
                <div className="p-2 border-b border-border bg-muted/30 font-semibold uppercase text-[10px] flex justify-between items-center">
                  <span>TREASURY SOURCE DISBURSEMENT</span>
                  <span className="text-[9px] font-normal">[STRIPE CONNECT]</span>
                </div>
                <div className="p-3 space-y-2 text-[11px]">
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase font-semibold">SOURCE</div>
                    <div className="font-semibold uppercase mt-0.5 text-[13px]">Bank account linked via Stripe Connect</div>
                    <div className="text-[10px] text-muted-foreground mt-1">Balance and payout details are managed in the Stripe dashboard (Financial → Stripe Connections). This app does not store bank balances.</div>
                  </div>
                  <div className="border-t border-border pt-2 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">REQUIRED FOR RUN (PREVIEW):</span>
                      <span className="font-semibold text-sm text-foreground">${activeBatchNet.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax withholding — honest: there is no withholding engine. */}
              <div className="border border-border bg-card">
                <div className="p-2 border-b border-border bg-muted/30 font-semibold uppercase text-[10px] flex justify-between items-center">
                  <span>TAX WITHHOLDING</span>
                  <span className="text-[9px] font-normal">[NOT COMPUTED]</span>
                </div>
                <div className="p-3 space-y-1.5 text-[11px]">
                  <p className="text-muted-foreground">No withholding engine is built yet. Payroll runs record tax_withheld as $0.00 and net pay equals gross pay. Federal obligations (941 / 940 / W-2) are listed in the Payroll Taxes tab — nothing is accrued or escrowed here.</p>
                  <div className="flex justify-between items-center pt-2 font-semibold border-t border-border">
                    <span>TAX WITHHELD (PREVIEW):</span>
                    <span className="text-sm font-semibold">${activeBatchTax.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* NACHA PPD — the real file is generated per run by
                  GET /api/admin/payroll/runs/[id]/ach, gated on the
                  tenant's Stripe Connect onboarding being complete. */}
              <div className="border border-border bg-card">
                <div className="p-2 border-b border-border bg-muted/30 font-semibold uppercase text-[10px]">
                  NACHA PPD FILE
                </div>
                <div className="p-3 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SOURCE RUN:</span>
                    <span className="font-semibold">{payrollRuns[0]?.number || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">FILE FORMAT:</span>
                    <span className="font-semibold">ACH STANDARD 94-BYTE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PAY DATE:</span>
                    <span className="font-semibold">{payrollRuns[0]?.pay_date || '—'}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Use DOWNLOAD ACH BATCH FILE above. The file is only generated when Stripe Connect
                    onboarding is complete for this business; employees without bank details on their
                    staff record are skipped and named by the download endpoint.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: EMPLOYEES */}
      {activeTab === 'employees' && (
        <div className="flex flex-col w-full animate-fade-in">
          {/* HEADER ACTION BANNER */}
          <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">SEC:3.11 // WORKFORCE COMPENSATION &amp; TAX ELECTIONS</div>
              <h1 className="text-sm font-semibold uppercase mt-0.5">3.11 PAYROLL // EMPLOYEES DIRECTORY &amp; WAGE SETUP</h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowAddEmployee(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer"
              >
                + ADD EMPLOYEE / CONTRACTOR
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Table Area (8 Cols) */}
            <div className="lg:col-span-8 border-b lg: lg:border-r border-border flex flex-col bg-card">
              {/* Table Filters */}
              <div className="p-2 border-b border-border bg-muted/30 flex items-center justify-between text-[11px] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">FILTER:</span>
                  <button 
                    onClick={() => setFilterFilterClass('ALL')}
                    className={`border border-border px-2 py-0.5 font-semibold cursor-pointer ${filterClass === 'ALL' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}
                  >
                    ALL ({employeesList.length})
                  </button>
                  <button
                    onClick={() => setFilterFilterClass('Groomer')}
                    className={`border border-border px-2 py-0.5 font-semibold cursor-pointer ${filterClass === 'Groomer' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}
                  >
                    GROOMERS ({employeesList.filter(e => e.class === 'Groomer').length})
                  </button>
                  <button
                    onClick={() => setFilterFilterClass('Staff')}
                    className={`border border-border px-2 py-0.5 font-semibold cursor-pointer ${filterClass === 'Staff' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}
                  >
                    STAFF ({employeesList.filter(e => e.class === 'Staff').length})
                  </button>
                </div>
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">SORT: EMP_ID ASC</div>
              </div>

              {/* Roster Table */}
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-semibold">
                      <th className="p-2 w-8 text-center border-r border-border">
                        <input type="checkbox" className="h-3.5 w-3.5 border-border text-foreground" />
                      </th>
                      <th className="p-2 border-r border-border w-24">EMP ID</th>
                      <th className="p-2 border-r border-border">NAME &amp; ROLE</th>
                      <th className="p-2 border-r border-border w-28">CLASS</th>
                      <th className="p-2 border-r border-border text-right w-44">PAY BASIS &amp; COMMISSION</th>
                      <th className="p-2 border-r border-border w-28">TAX PROFILE</th>
                      <th className="p-2 border-r border-border w-36">DIRECT DEPOSIT</th>
                      <th className="p-2 text-center w-24">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {employeesList.filter(e => filterClass === 'ALL' || e.class === filterClass).map((emp) => (
                      <tr 
                        key={emp.id} 
                        onClick={() => setSelectedEmployeeId(emp.id)}
                        className={`hover:bg-muted/30 cursor-pointer ${emp.id === selectedEmpId ? 'bg-muted/40 font-semibold border-l-4 border-l-black' : ''}`}
                      >
                        <td className="p-2 border-r border-border text-center" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="h-3.5 w-3.5 border-border text-foreground" />
                        </td>
                        <td className="p-2 border-r border-border tabular-nums font-semibold">{emp.id}</td>
                        <td className="p-2 border-r border-border">
                          <div className="font-semibold uppercase text-foreground">{emp.name}</div>
                          <div className="text-[9px] text-muted-foreground">{emp.role}</div>
                        </td>
                        <td className="p-2 border-r border-border">{emp.class}</td>
                        <td className="p-2 border-r border-border text-right">
                          {emp.payType === 'salary' || emp.payType === 'salary_plus_commission'
                            ? <div className="font-semibold">${(emp.salaryAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}/{emp.salaryPeriod === 'monthly' ? 'mo' : emp.salaryPeriod === 'weekly' ? 'wk' : emp.salaryPeriod === 'biweekly' ? '2wk' : 'yr'}</div>
                            : emp.payType === 'commission'
                              ? <div className="font-semibold">Commission only</div>
                              : <div className="font-semibold">${emp.baseWage.toFixed(2)}/hr</div>}
                          {emp.commissionRate > 0 && <div className="text-[9px] text-muted-foreground">+{emp.commissionRate}% Svc Comm</div>}
                        </td>
                        <td className="p-2 border-r border-border">{emp.w4Status}</td>
                        <td className="p-2 border-r border-border tabular-nums">{emp.account}</td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 text-[9px] font-semibold ${emp.status === 'ACTIVE' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground border border-border'}`}>{emp.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Employee Detailed Inspector */}
            <div className="lg:col-span-4 flex flex-col bg-card">
              {/* Header */}
              <div className="p-3 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Employee Record {selectedEmployee.id}</span>
                  <span className="bg-primary text-primary-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase">{selectedEmployee.class} · {selectedEmployee.status}</span>
                </div>
                <h2 className="font-display text-sm font-semibold tracking-tight text-foreground mt-1">{selectedEmployee.name}</h2>
                <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">{selectedEmployee.role}</div>
              </div>

              {/* Attributes Details */}
              <div className="p-3.5 space-y-4 flex-1">
                {/* YTD Cumulative */}
                <div className="border border-border p-3 bg-card">
                  <div className="text-[9px] uppercase font-semibold text-muted-foreground">YTD GROSS DISBURSED (FY25)</div>
                  <div className="text-lg font-semibold text-foreground tracking-tight mt-0.5">${selectedEmployee.ytdGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground border-t border-border pt-1.5 mt-2">
                    <span>YTD NET DISBURSED:</span>
                    <span className="font-semibold text-foreground">${selectedEmployee.ytdNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                    <span>TOTAL TAXES WITHHELD:</span>
                    <span className="font-semibold text-foreground">${selectedEmployee.ytdTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Earnings Structure */}
                <div className="border border-border p-3 space-y-1.5">
                  <div className="text-[9px] font-semibold text-foreground uppercase border-b border-border pb-1 flex justify-between">
                    <span>EARNINGS STRUCTURE</span>
                    <span className="font-normal text-muted-foreground">TIER-1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PAY TYPE:</span>
                    <span className="font-semibold">{{ hourly: 'HOURLY', salary: 'SALARY', commission: 'COMMISSION', salary_plus_commission: 'SALARY + COMMISSION', hourly_plus_commission: 'HOURLY + COMMISSION' }[selectedEmployee.payType as string] || 'HOURLY'}</span>
                  </div>
                  {(selectedEmployee.payType === 'salary' || selectedEmployee.payType === 'salary_plus_commission') && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SALARY:</span>
                      <span className="font-semibold">${(selectedEmployee.salaryAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / {(selectedEmployee.salaryPeriod || 'annual').toUpperCase()}</span>
                    </div>
                  )}
                  {(selectedEmployee.payType === 'hourly' || selectedEmployee.payType === 'hourly_plus_commission') && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">BASE HOURLY WAGE:</span>
                      <span className="font-semibold">${selectedEmployee.baseWage.toFixed(2)} / HOUR</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">COMMISSION ALLOCATION:</span>
                    <span className="font-semibold">{selectedEmployee.commissionRate == null ? 'Not set' : `${selectedEmployee.commissionRate}% SERVICE GROSS`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ACCRUED COMMISSION (30D):</span>
                    <span className="font-semibold">${(selectedEmployee.commissionAmt || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">OVERTIME MULTIPLIER:</span>
                    <span className="font-semibold">{selectedEmployee.otMultiplier}X BASE (${(selectedEmployee.baseWage * selectedEmployee.otMultiplier).toFixed(2)}/HR)</span>
                  </div>
                </div>

                {/* Withholdings — honest: no W-4 elections are stored and
                    no withholding engine exists. */}
                <div className="border border-border p-3 space-y-1.5">
                  <div className="text-[9px] font-semibold text-foreground uppercase border-b border-border pb-1 flex justify-between">
                    <span>WITHHOLDING ELECTIONS</span>
                    <span className="font-normal text-muted-foreground">NOT STORED</span>
                  </div>
                  <p className="text-muted-foreground">No W-4 elections are stored for this employee, and payroll runs withhold $0 — there is no withholding engine yet. Nothing is claimed here that the records don't hold.</p>
                </div>

                {/* Direct Deposit — bank details live on the staff record
                    for ACH file generation and are not displayed here. */}
                <div className="border border-border p-3 space-y-1.5">
                  <div className="text-[9px] font-semibold text-foreground uppercase border-b border-border pb-1 flex justify-between">
                    <span>DISBURSEMENT ROUTING</span>
                    <span className="font-normal text-muted-foreground">ACH</span>
                  </div>
                  <p className="text-muted-foreground">Bank details on the staff record are used only to generate the ACH batch file for a run. They are not shown in this directory view.</p>
                </div>
              </div>

              {/* Action Buttons footer */}
              <div className="border-t border-border p-3.5 bg-muted/30 space-y-2">
                <button
                  onClick={openEditComp}
                  title="Edit this employee's pay type, rates and commission — saved to their staff profile"
                  className="w-full border border-border bg-primary text-primary-foreground py-1.5 text-[13px] font-semibold hover:bg-muted tracking-wider cursor-pointer"
                >
                  EDIT COMPENSATION &amp; COMMISSIONS
                </button>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <button 
                    disabled title="Pay stub generation is not built yet — requires processed payroll runs"
                    className="border border-border bg-card text-foreground py-1 font-semibold hover:bg-muted/40 cursor-pointer text-center"
                  >
                    VIEW PAY STUBS
                  </button>
                  <button 
                    disabled title="W-4 / W-9 document generation is not built yet"
                    className="border border-border bg-card text-foreground py-1 font-semibold hover:bg-muted/40 cursor-pointer text-center"
                  >
                    DOWNLOAD W-4 PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: TIMESHEETS */}
      {activeTab === 'timesheets' && (
        <div className="flex flex-col w-full animate-fade-in">
          {/* HEADER ACTION BANNER */}
          <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card">
            <div>
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                SEC:3.11 // SHIFT RECONCILIATION &amp; COMMISSION AUDIT
              </div>
              <h1 className="text-sm font-semibold uppercase mt-0.5">
                3.11 PAYROLL // TIMESHEETS &amp; SHIFT CLOCK RECONCILIATION
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                disabled title="No time-clock feed is connected — punches are recorded via timesheets"
                className="border border-border px-2.5 py-1 font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none cursor-pointer"
              >
                + FORCE CLOCK-OUT ALL
              </button>
              <button 
                disabled title="No time-clock hardware is connected"
                className="border border-border px-2.5 py-1 font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none cursor-pointer"
              >
                SYNC TIME CLOCK HW
              </button>
              <button 
                onClick={handleBatchApproveTimesheets}
                disabled={approvingTimesheets || timesheetPunches.filter((t: any) => t.status === 'pending').length === 0}
                className="bg-primary text-primary-foreground border border-border px-2.5 py-1 font-semibold hover:bg-muted transition-none cursor-pointer disabled:opacity-50"
              >
                {approvingTimesheets ? 'APPROVING…' : `BATCH APPROVE TIMESHEETS (${timesheetPunches.filter((t: any) => t.status === 'pending').length})`}
              </button>
            </div>
          </div>

          {/* TIMESHEET SUMMARY KPIs — computed from the real
              payroll_timesheets rows below, never hardcoded. */}
          {(() => {
            const n = (v: any) => Number(v || 0);
            const totReg = timesheetPunches.reduce((a, t) => a + n(t.hours_regular), 0);
            const totOt = timesheetPunches.reduce((a, t) => a + n(t.hours_overtime), 0);
            const totPto = timesheetPunches.reduce((a, t) => a + n(t.hours_pto), 0);
            const totSick = timesheetPunches.reduce((a, t) => a + n(t.hours_sick), 0);
            const pendingCount = timesheetPunches.filter((t) => t.status === 'pending').length;
            const approvedCount = timesheetPunches.filter((t) => t.status === 'approved').length;
            return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-border divide-y sm:divide-y-0 sm:divide-x divide-border bg-card">
            <div className="p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">TOTAL LOGGED HOURS</span>
              <div className="text-lg font-semibold my-1">{(totReg + totOt + totPto + totSick).toFixed(1)} HRS</div>
              <div className="text-[10px] border-t border-border pt-1 text-muted-foreground">
                REGULAR: <strong className="text-foreground">{totReg.toFixed(1)}H</strong> | OVERTIME: <strong className="text-foreground">{totOt.toFixed(1)}H</strong>
              </div>
            </div>
            <div className="p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">AWAITING APPROVAL</span>
              <div className="text-lg font-semibold my-1">{pendingCount} TIMESHEET{pendingCount === 1 ? '' : 'S'}</div>
              <div className="text-[10px] border-t border-border pt-1 text-muted-foreground">
                Only approved timesheets are paid by a payroll run.
              </div>
            </div>
            <div className="p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">PTO / SICK HOURS</span>
              <div className="text-lg font-semibold my-1">{(totPto + totSick).toFixed(1)} HRS</div>
              <div className="text-[10px] border-t border-border pt-1 text-muted-foreground">
                PTO counts as paid hours in hourly gross; sick hours are tracked for the record.
              </div>
            </div>
            <div className="p-3 flex flex-col justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">MANAGER SIGN-OFF</span>
              <div className="text-lg font-semibold my-1">{approvedCount} / {timesheetPunches.length} APPROVED</div>
              <div className="text-[10px] border-t border-border pt-1 text-muted-foreground">
                APPROVAL PENDING: <strong className="text-foreground">{pendingCount}</strong>
              </div>
            </div>
          </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0">
            {/* Timesheet List Table — real payroll_timesheets rows */}
            <div className="lg:col-span-8 border-b lg: lg:border-r border-border flex flex-col overflow-hidden bg-card">
              <div className="p-2.5 border-b border-border bg-muted/30 flex items-center justify-between text-[11px] font-semibold shrink-0">
                <span>TIMESHEETS (payroll_timesheets)</span>
                <span className="text-[10px] font-normal text-muted-foreground">CLICK A ROW TO EDIT (SA-89)</span>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-semibold tabular-nums">
                      <th className="p-2 border-r border-border">EMPLOYEE</th>
                      <th className="p-2 border-r border-border">WEEK START</th>
                      <th className="p-2 border-r border-border text-right">REG HR</th>
                      <th className="p-2 border-r border-border text-right">OT HR</th>
                      <th className="p-2 border-r border-border text-right">PTO HR</th>
                      <th className="p-2 border-r border-border text-right">SICK HR</th>
                      <th className="p-2">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {timesheetsLoading ? (
                      <tr><td colSpan={7} className="p-12 text-center text-muted-foreground text-[13px]">Loading timesheets…</td></tr>
                    ) : timesheetPunches.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground text-[13px]">
                          No timesheets recorded yet. Timesheets appear here from the payroll_timesheets table; approved ones are paid by the next payroll run.
                        </td>
                      </tr>
                    ) : timesheetPunches.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => openTimesheetEditor(t)}
                        className={`hover:bg-muted/30 cursor-pointer ${t.id === selectedPunchId ? 'bg-muted/40 font-semibold border-l-4 border-l-black' : ''}`}
                      >
                        <td className="p-2 border-r border-border font-semibold">{t.employee_name || t.employee_id}</td>
                        <td className="p-2 border-r border-border tabular-nums">{t.week_start || '—'}</td>
                        <td className="p-2 border-r border-border text-right">{Number(t.hours_regular || 0)}h</td>
                        <td className="p-2 border-r border-border text-right font-semibold">{Number(t.hours_overtime || 0)}h</td>
                        <td className="p-2 border-r border-border text-right">{Number(t.hours_pto || 0)}h</td>
                        <td className="p-2 border-r border-border text-right">{Number(t.hours_sick || 0)}h</td>
                        <td className="p-2 font-semibold text-[10px] uppercase">{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SA-89 Editor Inspector — real edit via fin_edit_timesheet */}
            <div className="lg:col-span-4 flex flex-col bg-card overflow-y-auto">
              {!selectedPunch ? (
                <div className="p-12 text-center text-muted-foreground text-[13px]">
                  Select a timesheet to edit its hours, notes, or approval status. Every save is written to the audit log.
                </div>
              ) : (
              <>
              <div className="p-2 border-b border-border bg-primary text-primary-foreground text-[10px] font-semibold flex justify-between items-center">
                <span>EDIT TIMESHEET (SA-89)</span>
                <span className="text-[9px] uppercase tracking-wider">{selectedPunch.status}</span>
              </div>
              <div className="p-4 space-y-4">
                <div className="border border-border p-2.5 bg-muted/30 space-y-1">
                  <div className="text-[9px] text-muted-foreground uppercase font-semibold">EMPLOYEE / WEEK</div>
                  <div className="text-[13px] font-semibold text-foreground">{selectedPunch.employee_name || selectedPunch.employee_id}</div>
                  <div className="text-[10px] text-muted-foreground">WEEK START: {selectedPunch.week_start || '—'}</div>
                  {selectedPunch.status === 'processed' && (
                    <div className="text-[10px] text-destructive font-semibold">This timesheet was already processed into a payroll run — the API locks it against edits (409).</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {([['hours_regular', 'Regular Hours'], ['hours_overtime', 'Overtime Hours'], ['hours_pto', 'PTO Hours'], ['hours_sick', 'Sick Hours']] as const).map(([k, label]) => (
                    <label key={k} className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase font-semibold text-muted-foreground">{label}</span>
                      <input type="number" min="0" step="0.25" value={tsForm[k]} onChange={(e) => setTsForm({ ...tsForm, [k]: e.target.value })}
                        className="border border-border bg-card px-2 py-1.5" />
                    </label>
                  ))}
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Status</span>
                    <select value={tsForm.status} onChange={(e) => setTsForm({ ...tsForm, status: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                      <option value="draft">Draft</option>
                      <option value="pending">Pending</option>
                      <option value="submitted">Submitted</option>
                      <option value="approved">Approved</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Notes</span>
                    <textarea value={tsForm.notes} onChange={(e) => setTsForm({ ...tsForm, notes: e.target.value })}
                      className="border border-border bg-card px-2 py-1.5 min-h-[60px]" />
                  </label>
                </div>
                {tsError && <div className="text-red-600 font-semibold text-[11px]">{tsError}</div>}
                {tsNotice && <div className="text-success font-semibold text-[11px]">{tsNotice}</div>}
                <button
                  onClick={handleSaveTimesheet}
                  disabled={tsSaving || selectedPunch.status === 'processed'}
                  className="w-full bg-primary text-primary-foreground font-semibold py-1.5 px-3 text-[13px] hover:bg-muted transition-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{tsSaving ? 'SAVING…' : '[SAVE TIMESHEET — AUDITED]'}</span>
                </button>
                <p className="text-[10px] text-muted-foreground">Approving stamps approved_at and the approver on the row. Payroll runs only pay approved timesheets, and mark them processed.</p>
              </div>
              </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col w-full animate-fade-in">
          {/* HEADER ACTION BANNER */}
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-card">
            <div>
              <div className="text-[10px] tracking-wider text-foreground tabular-nums">SEC:3.11 // HISTORICAL DISBURSEMENTS &amp; PAY STUB LEDGER</div>
              <h1 className="text-sm font-semibold uppercase tracking-tight">3.11 PAYROLL // TRANSACTIONS &amp; DISBURSEMENTS ARCHIVE</h1>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleExportGlCsv} disabled={payrollRuns.length === 0} title={payrollRuns.length === 0 ? 'No payroll runs to export yet' : 'Download payroll runs as CSV'}
                className="border border-border px-2.5 py-1 text-[10px] font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none uppercase cursor-pointer"
              >
                [EXPORT GL CSV]
              </button>
              <button 
                disabled title="Bulk pay stub delivery is not built yet — requires processed payroll runs"
                className="border border-border px-2.5 py-1 text-[10px] font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none uppercase cursor-pointer"
              >
                [PRINT ALL PAY STUBS]
              </button>
            </div>
          </div>

          {/* HISTORICAL KPIs — computed from the real payroll_runs
              fetched into payrollRuns state. (An earlier audit pass froze
              these at "empty" — the runs table is payroll_runs, not the
              legacy acct_payroll_runs, and it does hold runs.) */}
          {(() => {
            const totalGross = payrollRuns.reduce((a, r) => a + Number(r.gross_wages || 0), 0);
            const totalNet = payrollRuns.reduce((a, r) => a + Number(r.net_paid || 0), 0);
            const latest = payrollRuns[0];
            return (
          <div className="grid grid-cols-1 md:grid-cols-4 border-b border-border text-[13px] shrink-0">
            <div className="p-3 border-r border-border">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">TOTAL GROSS (ALL RUNS)</div>
              <div className="text-lg font-semibold tracking-tight my-1 tabular-nums">${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div className="text-[9px] uppercase tabular-nums text-muted-foreground">{payrollRuns.length === 0 ? 'No payroll runs recorded' : 'Sum of gross_wages on payroll_runs'}</div>
            </div>
            <div className="p-3 border-r border-border">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">LATEST RUN</div>
              <div className="text-lg font-semibold tracking-tight my-1 tabular-nums">{latest?.pay_date || '—'}</div>
              <div className="text-[9px] uppercase tabular-nums text-muted-foreground">{latest ? `${latest.number} · ${String(latest.status).toUpperCase()}` : 'No batches yet'}</div>
            </div>
            <div className="p-3 border-r border-border">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">PAYROLL RUNS</div>
              <div className="text-lg font-semibold tracking-tight my-1 tabular-nums">{payrollRuns.length}</div>
              <div className="text-[9px] uppercase tabular-nums text-muted-foreground">Rows in payroll_runs</div>
            </div>
            <div className="p-3">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">TOTAL NET (ALL RUNS)</div>
              <div className="text-lg font-semibold tracking-tight my-1 tabular-nums">${totalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div className="text-[9px] uppercase tabular-nums text-muted-foreground">Tax withheld is $0 — no withholding engine</div>
            </div>
          </div>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0">
            {/* Batches Table — real payroll_runs rows */}
            <div className="lg:col-span-7 border-b lg: lg:border-r border-border flex flex-col bg-card">
              <div className="p-2 border-b border-border flex items-center justify-between text-[11px] bg-muted/30 shrink-0">
                <span className="font-semibold">HISTORICAL BATCH ARCHIVE</span>
                <span className="text-[10px] font-normal text-muted-foreground">CLICK A BATCH TO INSPECT ITS PAY STUBS</span>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-semibold tabular-nums">
                      <th className="p-2 border-r border-border">BATCH ID</th>
                      <th className="p-2 border-r border-border">DATE PERIOD</th>
                      <th className="p-2 border-r border-border">PAY DATE</th>
                      <th className="p-2 border-r border-border text-right">GROSS</th>
                      <th className="p-2 border-r border-border text-right">TAX WH</th>
                      <th className="p-2 border-r border-border text-right">NET ACH</th>
                      <th className="p-2 text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {payrollRuns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground text-[13px]">
                          No payroll batches recorded. Run payroll to generate batches here.
                        </td>
                      </tr>
                    ) : payrollRuns.map((r: any) => (
                      <tr key={r.id} onClick={() => setSelectedRunId(r.id)}
                        className={`hover:bg-muted/30 cursor-pointer ${r.id === selectedRunId ? 'bg-muted/40 font-semibold border-l-4 border-l-black' : ''}`}>
                        <td className="p-2 border-r border-border font-semibold">{r.number}</td>
                        <td className="p-2 border-r border-border">{r.pay_period_start} → {r.pay_period_end}</td>
                        <td className="p-2 border-r border-border">{r.pay_date}</td>
                        <td className="p-2 border-r border-border text-right">${Number(r.gross_wages || 0).toFixed(2)}</td>
                        <td className="p-2 border-r border-border text-right">${Number(r.tax_withheld || 0).toFixed(2)}</td>
                        <td className="p-2 border-r border-border text-right font-semibold">${Number(r.net_paid || 0).toFixed(2)}</td>
                        <td className="p-2 text-center uppercase">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pay Stub Details & Journal Entry (4 Cols) */}
            <div className="lg:col-span-5 flex flex-col bg-card overflow-y-auto">
              <div className="p-2 border-b border-border bg-primary text-primary-foreground flex justify-between items-center shrink-0">
                <span className="font-semibold text-[10px] tracking-wider uppercase">PAY STUB &amp; VOUCHER INSPECTOR</span>
                <span className="text-[9px] bg-card text-foreground px-1 font-semibold">STUB AUDIT</span>
              </div>
              {/* Pay stubs = the selected run's real payroll_run_items.
                  Runs recorded before the unified engine have no items —
                  that is stated, never backfilled with invented stubs. */}
              {runDetailLoading ? (
                <div className="p-12 text-center text-muted-foreground text-[13px]">Loading run items…</div>
              ) : !runDetail ? (
                <div className="p-12 text-center text-muted-foreground text-[13px]">
                  Select a payroll batch to see its per-employee pay stubs.
                </div>
              ) : runDetail.items.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground text-[13px]">
                  Run {runDetail.run.number} recorded no per-employee items, so it has no pay stubs.
                  Runs created by the current payroll engine record one item per paid employee.
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <div className="p-2.5 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase">
                    {runDetail.run.number} · {runDetail.run.pay_period_start} → {runDetail.run.pay_period_end} · PAY DATE {runDetail.run.pay_date}
                  </div>
                  {/* Run lifecycle actions — the run's status drives which
                      transitions exist; the server enforces the same
                      machine plus the disbursement gates. */}
                  <div className="p-2.5 border-b border-border flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="font-semibold uppercase">Status: {String(runDetail.run.status).toUpperCase()}</span>
                    {runDetail.run.status === 'posted' && runDetail.run.journal_id && (
                      <span className="text-muted-foreground">· JOURNAL ENTRY {String(runDetail.run.journal_id).slice(0, 8)}…</span>
                    )}
                    <span className="flex-1" />
                    {runDetail.run.status === 'draft' && (
                      <>
                        <button onClick={() => handleRunAction('approve')} disabled={!!runActionBusy} className="bg-primary text-primary-foreground px-2.5 py-1 font-semibold cursor-pointer disabled:opacity-50">{runActionBusy === 'approve' ? 'APPROVING…' : 'APPROVE RUN'}</button>
                        <button onClick={() => handleRunAction('void')} disabled={!!runActionBusy} className="border border-border px-2.5 py-1 font-semibold cursor-pointer disabled:opacity-50">{runActionBusy === 'void' ? 'VOIDING…' : 'VOID RUN'}</button>
                      </>
                    )}
                    {runDetail.run.status === 'approved' && (
                      <button onClick={() => handleRunAction('pay')} disabled={!!runActionBusy} className="bg-primary text-primary-foreground px-2.5 py-1 font-semibold cursor-pointer disabled:opacity-50">{runActionBusy === 'pay' ? 'PAYING…' : 'MARK PAID — DISBURSE'}</button>
                    )}
                    {runDetail.run.status === 'paid' && (
                      <button onClick={() => handleRunAction('post')} disabled={!!runActionBusy} className="bg-primary text-primary-foreground px-2.5 py-1 font-semibold cursor-pointer disabled:opacity-50">{runActionBusy === 'post' ? 'POSTING…' : 'POST TO BOOKS'}</button>
                    )}
                    {runActionError && <span className="w-full text-red-600 font-semibold">{runActionError}</span>}
                  </div>
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-semibold tabular-nums">
                        <th className="p-2 border-r border-border">EMPLOYEE</th>
                        <th className="p-2 border-r border-border text-right">REG HR</th>
                        <th className="p-2 border-r border-border text-right">OT HR</th>
                        <th className="p-2 border-r border-border text-right">COMM</th>
                        <th className="p-2 border-r border-border text-right">GROSS</th>
                        <th className="p-2 border-r border-border text-right">TAX WH</th>
                        <th className="p-2 text-right">NET</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {runDetail.items.map((it: any) => (
                        <tr key={it.id} className="hover:bg-muted/30">
                          <td className="p-2 border-r border-border font-semibold">{it.employee_name || it.employee_id}</td>
                          <td className="p-2 border-r border-border text-right">{Number(it.hours_regular || 0)}</td>
                          <td className="p-2 border-r border-border text-right">{Number(it.hours_overtime || 0)}</td>
                          <td className="p-2 border-r border-border text-right">${Number(it.commission_amount || 0).toFixed(2)}</td>
                          <td className="p-2 border-r border-border text-right">${Number(it.gross_wages || 0).toFixed(2)}</td>
                          <td className="p-2 border-r border-border text-right">${Number(it.tax_withheld || 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-semibold">${Number(it.net_paid || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="p-2.5 text-[10px] text-muted-foreground">Tax withheld is computed per line by the withholding engine from the employee&apos;s recorded tax profile; a line with no profile on file withholds $0.00 and is flagged in the run summary. Net = gross − tax − post-tax deductions.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: TAXES */}
            {activeTab === 'taxes' && (
        <div className="flex flex-col w-full animate-fade-in">
          <div className="p-4 border-b border-border bg-card">
            <div className="text-[10px] text-muted-foreground tracking-wider font-semibold">SEC:3.11 // STATUTORY TAXES &amp; WITHHOLDING COMPLIANCE</div>
            <h1 className="text-sm font-semibold uppercase mt-0.5">3.11 PAYROLL // PAYROLL TAXES — TENNESSEE</h1>
          </div>
          <div className="p-6 space-y-4 max-w-3xl">
            <div className="border border-border p-4 bg-card">
              <h2 className="text-xs font-semibold uppercase mb-2">Tennessee — No State Income Tax</h2>
              <p className="text-xs text-muted-foreground">
                Tennessee has no state income tax on wages. No state withholding is required.
                Employers still owe federal payroll taxes (Form 941 withholding + FICA, Form 940 FUTA)
                and Tennessee SUTA (unemployment insurance) once a UI account is opened with the
                TN Department of Labor and Workforce Development.
              </p>
            </div>
            <div className="border border-border p-4 bg-card">
              <h2 className="text-xs font-semibold uppercase mb-2">Federal Obligations</h2>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Form 941 — Employer's Quarterly Federal Tax Return (withholding + FICA)</li>
                <li>Form 940 — Employer's Annual Federal Unemployment (FUTA) Tax Return</li>
                <li>W-2 / W-3 — Annual wage reporting</li>
              </ul>
            </div>
            <div className="border border-border p-4 bg-card">
              <h2 className="text-xs font-semibold uppercase mb-2">Status</h2>
              <p className="text-xs text-muted-foreground">
                Payroll runs compute tax withheld per employee from their recorded withholding
                profiles. When a run is paid, the quarter&apos;s Form 941 record is written to
                payroll_tax_forms from the paid runs (status: draft — recorded, not filed). The
                forms below are the tax forms on record; when the list is empty, no run has been
                paid yet, so no forms have been recorded.
              </p>
            </div>
            <div className="border border-border p-4 bg-card">
              <h2 className="text-xs font-semibold uppercase mb-2">Tax Forms (SA-90)</h2>
              {taxForms === null ? (
                <p className="text-xs text-muted-foreground">Loading tax forms…</p>
              ) : taxForms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tax forms on record for this business yet. Forms recorded in payroll_tax_forms will appear here with a download of their filed data.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase font-semibold">
                        <th className="p-2">Form</th><th className="p-2">Year</th><th className="p-2">Quarter</th>
                        <th className="p-2">Status</th><th className="p-2">Filed</th><th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {taxForms.map((f: any) => (
                        <tr key={f.id}>
                          <td className="p-2 font-semibold">{f.formType}</td>
                          <td className="p-2">{f.year}</td>
                          <td className="p-2">{f.quarter ?? '—'}</td>
                          <td className="p-2 uppercase">{f.status}</td>
                          <td className="p-2">{f.filedAt ? new Date(f.filedAt).toLocaleDateString() : '—'}</td>
                          <td className="p-2 text-right">
                            <button onClick={() => handleDownloadTaxForm(f)} className="border border-border px-2 py-1 font-semibold hover:bg-muted/40 cursor-pointer">DOWNLOAD</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT COMPENSATION MODAL — the pay profile on the staff record.
          Commission accrues from the profile rate when an appointment
          completes; payroll runs pay the accrued ledger out. */}
      {showEditComp && selectedEmployee?.id && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-3 border-b border-border bg-muted/30 flex justify-between items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Edit Compensation — {selectedEmployee.name}</span>
              <button onClick={() => setShowEditComp(false)} className="text-muted-foreground hover:text-foreground font-semibold cursor-pointer">✕</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 text-[11px]">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Pay Type</span>
                <select value={compForm.pay_type} onChange={(e) => setCompForm({ ...compForm, pay_type: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="commission">Commission</option>
                  <option value="salary_plus_commission">Salary + Commission</option>
                  <option value="hourly_plus_commission">Hourly + Commission</option>
                </select>
              </label>
              {(compForm.pay_type === 'hourly' || compForm.pay_type === 'hourly_plus_commission') && (
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground">Hourly Rate ($ / hr)</span>
                  <input type="number" min="0" step="0.01" value={compForm.hourly_rate} onChange={(e) => setCompForm({ ...compForm, hourly_rate: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="20.00" />
                </label>
              )}
              {(compForm.pay_type === 'salary' || compForm.pay_type === 'salary_plus_commission') && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Salary Amount ($)</span>
                    <input type="number" min="0" step="0.01" value={compForm.salary_amount} onChange={(e) => setCompForm({ ...compForm, salary_amount: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="52000" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Salary Period</span>
                    <select value={compForm.salary_period} onChange={(e) => setCompForm({ ...compForm, salary_period: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                      <option value="annual">Per Year</option>
                      <option value="monthly">Per Month</option>
                      <option value="biweekly">Every 2 Weeks</option>
                      <option value="weekly">Per Week</option>
                    </select>
                  </label>
                </>
              )}
              {compForm.pay_type.includes('commission') && (
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground">Commission Rate (% of service price)</span>
                  <input type="number" min="0" max="100" step="0.5" value={compForm.commission_rate} onChange={(e) => setCompForm({ ...compForm, commission_rate: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="50" />
                </label>
              )}
              <p className="col-span-2 text-muted-foreground">
                Commission accrues automatically when this employee&apos;s appointments are completed, and is paid out in payroll runs. Leave a rate blank to clear it — no rate means no accrual.
              </p>
              <div className="col-span-2 border-t border-border pt-3">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Withholding Profile — recorded tax inputs (tax_info)</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Federal Withholding (%)</span>
                <input type="number" min="0" max="100" step="0.1" value={compForm.tax_federal_percent} onChange={(e) => setCompForm({ ...compForm, tax_federal_percent: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="—" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">State Withholding (%)</span>
                <input type="number" min="0" max="100" step="0.1" value={compForm.tax_state_percent} onChange={(e) => setCompForm({ ...compForm, tax_state_percent: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="—" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Local Withholding (%)</span>
                <input type="number" min="0" max="100" step="0.1" value={compForm.tax_local_percent} onChange={(e) => setCompForm({ ...compForm, tax_local_percent: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="—" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Additional Withholding ($ / run)</span>
                <input type="number" min="0" step="0.01" value={compForm.tax_additional_amount} onChange={(e) => setCompForm({ ...compForm, tax_additional_amount: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="—" />
              </label>
              <p className="col-span-2 text-muted-foreground">
                Payroll computes this employee&apos;s tax withheld from these recorded inputs — there is no statutory rate table in the system and no rate is ever invented. All blank means no profile on file: withholding is $0.00 and the run flags the line. Tennessee has no state income tax on wages; record a state percent only if the employee&apos;s profile carries one.
              </p>
              {compError && <div className="col-span-2 text-red-600 font-semibold">{compError}</div>}
            </div>
            <div className="p-3 border-t border-border bg-muted/30 flex justify-end gap-2">
              <button onClick={() => setShowEditComp(false)} className="border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer bg-card">CANCEL</button>
              <button onClick={handleSaveComp} disabled={compSaving} className="bg-primary text-primary-foreground hover:bg-primary/90 border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer disabled:opacity-50">
                {compSaving ? 'SAVING…' : 'SAVE COMPENSATION'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD EMPLOYEE MODAL — form state + submit handler existed but were
          never rendered; this is the form they drive (incl. wage setup). */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-3 border-b border-border bg-muted/30 flex justify-between items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider">Add Employee / Contractor</span>
              <button onClick={() => setShowAddEmployee(false)} className="text-muted-foreground hover:text-foreground font-semibold cursor-pointer">✕</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 text-[11px]">
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">First Name *</span>
                <input value={newEmpForm.first_name} onChange={(e) => setNewEmpForm({ ...newEmpForm, first_name: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Last Name *</span>
                <input value={newEmpForm.last_name} onChange={(e) => setNewEmpForm({ ...newEmpForm, last_name: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Email</span>
                <input value={newEmpForm.email} onChange={(e) => setNewEmpForm({ ...newEmpForm, email: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Phone</span>
                <input value={newEmpForm.phone} onChange={(e) => setNewEmpForm({ ...newEmpForm, phone: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Role</span>
                <input value={newEmpForm.role} onChange={(e) => setNewEmpForm({ ...newEmpForm, role: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Hire Date</span>
                <input type="date" value={newEmpForm.hire_date} onChange={(e) => setNewEmpForm({ ...newEmpForm, hire_date: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={newEmpForm.is_service_staff} onChange={(e) => setNewEmpForm({ ...newEmpForm, is_service_staff: e.target.checked })} className="h-3.5 w-3.5 border-border" />
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Groomer</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Pay Type</span>
                <select value={newEmpForm.pay_type} onChange={(e) => setNewEmpForm({ ...newEmpForm, pay_type: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="commission">Commission</option>
                  <option value="salary_plus_commission">Salary + Commission</option>
                  <option value="hourly_plus_commission">Hourly + Commission</option>
                </select>
              </label>
              {(newEmpForm.pay_type === 'hourly' || newEmpForm.pay_type === 'hourly_plus_commission') && (
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground">Hourly Rate ($ / hr)</span>
                  <input type="number" min="0" step="0.01" value={newEmpForm.hourly_rate} onChange={(e) => setNewEmpForm({ ...newEmpForm, hourly_rate: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="20.00" />
                </label>
              )}
              {(newEmpForm.pay_type === 'salary' || newEmpForm.pay_type === 'salary_plus_commission') && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Salary Amount ($)</span>
                    <input type="number" min="0" step="0.01" value={newEmpForm.salary_amount} onChange={(e) => setNewEmpForm({ ...newEmpForm, salary_amount: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="52000" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] uppercase font-semibold text-muted-foreground">Salary Period</span>
                    <select value={newEmpForm.salary_period} onChange={(e) => setNewEmpForm({ ...newEmpForm, salary_period: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                      <option value="annual">Per Year</option>
                      <option value="monthly">Per Month</option>
                      <option value="biweekly">Every 2 Weeks</option>
                      <option value="weekly">Per Week</option>
                    </select>
                  </label>
                </>
              )}
              {newEmpForm.pay_type.includes('commission') && (
                <label className="flex flex-col gap-1">
                  <span className="text-[9px] uppercase font-semibold text-muted-foreground">Commission Rate (% of service price)</span>
                  <input type="number" min="0" max="100" step="0.5" value={newEmpForm.commission_rate} onChange={(e) => setNewEmpForm({ ...newEmpForm, commission_rate: e.target.value })} className="border border-border bg-card px-2 py-1.5" placeholder="50" />
                </label>
              )}
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Bank Routing Number</span>
                <input value={newEmpForm.bank_routing_number} onChange={(e) => setNewEmpForm({ ...newEmpForm, bank_routing_number: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Bank Account Number</span>
                <input value={newEmpForm.bank_account_number} onChange={(e) => setNewEmpForm({ ...newEmpForm, bank_account_number: e.target.value })} className="border border-border bg-card px-2 py-1.5" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] uppercase font-semibold text-muted-foreground">Account Type</span>
                <select value={newEmpForm.bank_account_type} onChange={(e) => setNewEmpForm({ ...newEmpForm, bank_account_type: e.target.value })} className="border border-border bg-card px-2 py-1.5">
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </label>
              {addEmpError && <div className="col-span-2 text-red-600 font-semibold">{addEmpError}</div>}
            </div>
            <div className="p-3 border-t border-border bg-muted/30 flex justify-end gap-2">
              <button onClick={() => setShowAddEmployee(false)} className="border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer bg-card">CANCEL</button>
              <button onClick={handleAddEmployee} disabled={addEmpSaving} className="bg-primary text-primary-foreground hover:bg-primary/90 border border-border px-3.5 py-1.5 font-semibold text-[10px] tracking-wide cursor-pointer disabled:opacity-50">
                {addEmpSaving ? 'SAVING…' : 'ADD EMPLOYEE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
