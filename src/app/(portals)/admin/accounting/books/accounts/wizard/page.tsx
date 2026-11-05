'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// /admin/accounting/books/accounts/wizard — Chart of Accounts wizard
// (owner's order, 2026-11-01). Two ways in:
//   1. Start from the BASIC CHART — the owner's starter template,
//      offered as a checklist; accounts already in the chart are
//      marked and skipped, taken numbers roll to the next free one
//      in the same band.
//   2. Add your OWN account — pick the kind, pick its band, name it
//      whatever you like, assign the number yourself.
// The numbering algorithm (owner's spec): the first digit is the
// kind — 1 Assets, 2 Liabilities, 3 Equity, 4 Revenue, 5 Expenses,
// 6 Overhead, 7 Other Income, 8 Other Expense — and each kind has
// bands inside it (assets: current 1000–1399, fixed 1400–1699,
// other 1700–1999; liabilities: current 2000–2499, long-term
// 2500–2999). The live chart is numbered in the thousands
// throughout (160 accounts; every posting rule uses them), so the
// wizard assigns numbers in the same thousands bands.
// Creates go through POST /api/admin/accounting/accounts — the same
// API the chart page uses. The wizard ends on PROOF: the accounts
// it created, listed with their numbers.

type Account = { id: string; code: string; name: string; account_type: string };

type Band = { key: string; label: string; hint: string; from: number; to: number; type: string; normal: 'debit' | 'credit' };

const BANDS: Band[] = [
  { key: 'asset-current', label: 'Assets — Current', hint: 'Cash, bank accounts, money customers owe you, inventory, prepayments. Used up or turned into cash within a year.', from: 1000, to: 1399, type: 'asset', normal: 'debit' },
  { key: 'asset-fixed', label: 'Assets — Fixed', hint: 'Equipment, vehicles, furniture — long-lived things the business uses.', from: 1400, to: 1699, type: 'asset', normal: 'debit' },
  { key: 'asset-other', label: 'Assets — Other', hint: 'Security deposits, long-term investments, trademarks and goodwill.', from: 1700, to: 1999, type: 'asset', normal: 'debit' },
  { key: 'liab-current', label: 'Liabilities — Current', hint: 'Bills, credit cards, payroll and sales tax owed, short-term loans. Due within a year.', from: 2000, to: 2499, type: 'liability', normal: 'credit' },
  { key: 'liab-long', label: 'Liabilities — Long-term', hint: 'Loans, mortgages and leases due beyond a year.', from: 2500, to: 2999, type: 'liability', normal: 'credit' },
  { key: 'equity', label: 'Equity', hint: "The owner's stake — capital put in, draws taken out, profits kept in the business.", from: 3000, to: 3999, type: 'equity', normal: 'credit' },
  { key: 'revenue', label: 'Revenue', hint: 'Money the business earns — sales, services, interest, other income.', from: 4000, to: 4999, type: 'revenue', normal: 'credit' },
  { key: 'expense-cogs', label: 'Expenses — Cost of Goods Sold', hint: 'What the products you sell cost you — supplier cost, direct labor, materials.', from: 5000, to: 5199, type: 'expense', normal: 'debit' },
  { key: 'expense-operating', label: 'Expenses — Operating', hint: 'Day-to-day running costs — marketing, insurance, rent, supplies, repairs.', from: 5200, to: 5999, type: 'expense', normal: 'debit' },
  { key: 'expense-overhead', label: 'Expenses — Overhead & Other', hint: 'Software, utilities, wages, interest and tax expense.', from: 6000, to: 6999, type: 'expense', normal: 'debit' },
  { key: 'other-income', label: 'Other Income', hint: 'Income that is not from selling — grants, one-off gains.', from: 7000, to: 7999, type: 'revenue', normal: 'credit' },
  { key: 'other-expense', label: 'Other Expense', hint: 'Costs that are not from operating — one-off losses and write-offs.', from: 8000, to: 8999, type: 'expense', normal: 'debit' },
];

// The owner's starter chart (names verbatim, 2026-11-01). `n` is his
// template number; the wizard proposes n×10 in the live chart and
// rolls forward to the next free number in the band when taken.
// `contra` flips the normal balance (the account reduces its kind).
const TEMPLATE: { n: number; name: string; band: string; contra?: boolean }[] = [
  { n: 101, name: 'Cash on Hand', band: 'asset-current' },
  { n: 105, name: 'Checking Account', band: 'asset-current' },
  { n: 110, name: 'Savings Account', band: 'asset-current' },
  { n: 120, name: 'Accounts Receivable', band: 'asset-current' },
  { n: 125, name: 'Inventory', band: 'asset-current' },
  { n: 130, name: 'Prepaid Expenses', band: 'asset-current' },
  { n: 140, name: 'Equipment', band: 'asset-fixed' },
  { n: 145, name: 'Accumulated Depreciation - Equipment', band: 'asset-fixed', contra: true },
  { n: 150, name: 'Vehicles', band: 'asset-fixed' },
  { n: 155, name: 'Accumulated Depreciation - Vehicles', band: 'asset-fixed', contra: true },
  { n: 160, name: 'Furniture and Fixtures', band: 'asset-fixed' },
  { n: 165, name: 'Leasehold Improvements', band: 'asset-fixed' },
  { n: 170, name: 'Security Deposits', band: 'asset-other' },
  { n: 175, name: 'Long-Term Investments', band: 'asset-other' },
  { n: 180, name: 'Intangible Assets', band: 'asset-other' },
  { n: 200, name: 'Accounts Payable', band: 'liab-current' },
  { n: 210, name: 'Credit Card Payable', band: 'liab-current' },
  { n: 220, name: 'Payroll Liabilities', band: 'liab-current' },
  { n: 225, name: 'Sales Tax Payable', band: 'liab-current' },
  { n: 230, name: 'Short-Term Loans', band: 'liab-current' },
  { n: 235, name: 'Current Portion of Long-Term Debt', band: 'liab-current' },
  { n: 240, name: 'Unearned Revenue', band: 'liab-current' },
  { n: 250, name: 'Long-Term Loans', band: 'liab-long' },
  { n: 260, name: 'Mortgage Payable', band: 'liab-long' },
  { n: 270, name: 'Lease Obligations', band: 'liab-long' },
  { n: 300, name: "Owner's Capital", band: 'equity' },
  { n: 305, name: "Owner's Draw", band: 'equity', contra: true },
  { n: 310, name: 'Retained Earnings', band: 'equity' },
  { n: 320, name: 'Common Stock', band: 'equity' },
  { n: 330, name: 'Additional Paid-In Capital', band: 'equity' },
  { n: 400, name: 'Sales Revenue', band: 'revenue' },
  { n: 410, name: 'Service Revenue', band: 'revenue' },
  { n: 420, name: 'Consulting Revenue', band: 'revenue' },
  { n: 450, name: 'Interest Income', band: 'revenue' },
  { n: 460, name: 'Other Income', band: 'revenue' },
  { n: 490, name: 'Sales Returns and Allowances', band: 'revenue', contra: true },
  { n: 500, name: 'Cost of Goods Sold', band: 'expense-cogs' },
  { n: 505, name: 'Direct Labor', band: 'expense-cogs' },
  { n: 510, name: 'Materials and Supplies', band: 'expense-cogs' },
  { n: 515, name: 'Subcontractor Costs', band: 'expense-cogs' },
  { n: 520, name: 'Advertising and Marketing', band: 'expense-operating' },
  { n: 530, name: 'Bank Fees and Charges', band: 'expense-operating' },
  { n: 540, name: 'Depreciation Expense', band: 'expense-operating' },
  { n: 550, name: 'Insurance', band: 'expense-operating' },
  { n: 560, name: 'Legal and Professional Fees', band: 'expense-operating' },
  { n: 570, name: 'Office Supplies', band: 'expense-operating' },
  { n: 580, name: 'Rent Expense', band: 'expense-operating' },
  { n: 590, name: 'Repairs and Maintenance', band: 'expense-operating' },
  { n: 600, name: 'Software and Subscriptions', band: 'expense-overhead' },
  { n: 610, name: 'Telephone and Internet', band: 'expense-overhead' },
  { n: 620, name: 'Travel and Entertainment', band: 'expense-overhead' },
  { n: 630, name: 'Utilities', band: 'expense-overhead' },
  { n: 640, name: 'Wages and Salaries', band: 'expense-overhead' },
  { n: 645, name: 'Payroll Taxes', band: 'expense-overhead' },
  { n: 650, name: 'Interest Expense', band: 'expense-overhead' },
  { n: 660, name: 'Income Tax Expense', band: 'expense-overhead' },
  { n: 670, name: 'Miscellaneous Expense', band: 'expense-overhead' },
];

const bandOf = (key: string) => BANDS.find((b) => b.key === key)!;
const bandForCode = (n: number) => BANDS.find((b) => n >= b.from && n <= b.to);

// CSV import (owner's order, 2026-11-01: "chart of accounts also
// needs to have an import"). One account per row:
//   number, name [, type]
// The number decides the kind via the bands above — a type column,
// when present, is checked against the number and a disagreement is
// flagged on the row rather than silently honored. A header row
// (first cell not a number) is skipped. Comma, semicolon, or tab
// separated; quoted fields supported.
function splitCsvLine(line: string): string[] {
  const delim = line.includes(',') ? ',' : line.includes(';') ? ';' : '\t';
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type ImportRow = { code: number | null; codeRaw: string; name: string; fileType: string; verdict: string | null };

function parseImport(text: string, usedCodes: Set<string>, existingNames: Set<string>): ImportRow[] {
  const rows: ImportRow[] = [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    const cells = splitCsvLine(line);
    const codeRaw = (cells[0] ?? '').replace(/[^0-9]/g, '');
    if (idx === 0 && codeRaw === '') return; // header row
    const name = cells[1] ?? '';
    const fileType = (cells[2] ?? '').toLowerCase();
    const code = codeRaw ? Number(codeRaw) : null;
    let verdict: string | null = null;
    if (code === null || !Number.isFinite(code)) verdict = 'No account number — skipped.';
    else if (!bandForCode(code)) verdict = 'Number is outside the 1000–8999 bands — skipped.';
    else if (!name) verdict = 'No name — skipped.';
    else if (usedCodes.has(String(code))) verdict = 'That number is already in your chart — skipped.';
    else if (existingNames.has(name.toLowerCase())) verdict = 'That name is already in your chart — skipped.';
    else if (seenCodes.has(String(code))) verdict = 'Same number appears twice in this file — skipped.';
    else if (seenNames.has(name.toLowerCase())) verdict = 'Same name appears twice in this file — skipped.';
    else if (fileType && bandForCode(code) && !fileType.includes(bandForCode(code)!.type)) verdict = `Ready — the file calls it "${cells[2]}" but the number ${code} files it as ${bandForCode(code)!.label}; it will be created by the number.`;
    if (code !== null) seenCodes.add(String(code));
    if (name) seenNames.add(name.toLowerCase());
    rows.push({ code, codeRaw, name, fileType: cells[2] ?? '', verdict });
  });
  return rows;
}

export default function ChartOfAccountsWizardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'choose' | 'template' | 'custom' | 'import'>('choose');
  const [importText, setImportText] = useState('');
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bandKey, setBandKey] = useState('asset-current');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contra, setContra] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ code: string; name: string; note: string }[] | null>(null);

  useEffect(() => {
    fetch('/api/admin/accounting/accounts?limit=500', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load the chart'))))
      .then((j) => {
        const rows: Account[] = j.accounts ?? j.data ?? [];
        setAccounts(rows);
        const names = new Set(rows.map((a) => a.name.trim().toLowerCase()));
        setPicked(new Set(TEMPLATE.filter((t) => !names.has(t.name.toLowerCase())).map((t) => t.n)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const usedCodes = useMemo(() => new Set(accounts.map((a) => String(parseInt(a.code, 10)))), [accounts]);
  const existingNames = useMemo(() => new Set(accounts.map((a) => a.name.trim().toLowerCase())), [accounts]);
  const importRows = useMemo(() => parseImport(importText, usedCodes, existingNames), [importText, usedCodes, existingNames]);
  const importReady = importRows.filter((r) => r.code !== null && (!r.verdict || r.verdict.startsWith('Ready')));

  const nextFree = (band: Band, startAt?: number) => {
    let c = Math.max(band.from, startAt ?? band.from);
    if (c % 10 !== 0) c = Math.ceil(c / 10) * 10;
    while (c <= band.to && usedCodes.has(String(c))) c += 10;
    return c <= band.to ? c : null;
  };

  const band = bandOf(bandKey);
  useEffect(() => {
    if (mode === 'custom' && step === 1) {
      const nf = nextFree(band);
      setCode(nf ? String(nf) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandKey, mode, step, accounts]);

  const codeNum = parseInt(code, 10);
  const codeError =
    mode === 'custom' && step === 1
      ? !Number.isFinite(codeNum)
        ? 'Enter a number.'
        : codeNum < band.from || codeNum > band.to
          ? `That number is outside the ${band.label} band (${band.from}–${band.to}).`
          : usedCodes.has(String(codeNum))
            ? 'That number is already used in your chart.'
            : null
      : null;

  async function createOne(body: Record<string, unknown>) {
    const r = await fetch('/api/admin/accounting/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Create failed');
    return j;
  }

  async function runTemplate() {
    setBusy(true);
    const out: { code: string; name: string; note: string }[] = [];
    const taken = new Set(usedCodes);
    for (const t of TEMPLATE) {
      if (!picked.has(t.n)) continue;
      if (existingNames.has(t.name.toLowerCase())) {
        out.push({ code: '—', name: t.name, note: 'Already in your chart — skipped.' });
        continue;
      }
      const b = bandOf(t.band);
      let c = t.n * 10;
      if (c < b.from) c = b.from;
      while (c <= b.to && taken.has(String(c))) c += 10;
      if (c > b.to) {
        out.push({ code: '—', name: t.name, note: `No free number left in the ${b.label} band.` });
        continue;
      }
      try {
        const j = await createOne({
          code: String(c),
          name: t.name,
          account_type: b.type,
          normal_balance: t.contra ? (b.normal === 'debit' ? 'credit' : 'debit') : b.normal,
        });
        taken.add(String(c));
        out.push({ code: String(j.code ?? c), name: t.name, note: c === t.n * 10 ? 'Created.' : `Created — number ${t.n * 10} was taken, used the next free one.` });
      } catch (e: any) {
        out.push({ code: '—', name: t.name, note: e.message });
      }
    }
    setResults(out);
    setBusy(false);
  }

  async function runImport() {
    setBusy(true);
    const out: { code: string; name: string; note: string }[] = [];
    for (const row of importRows) {
      if (row.code === null || (row.verdict && !row.verdict.startsWith('Ready'))) {
        out.push({ code: row.codeRaw || '—', name: row.name || '(unnamed)', note: row.verdict ?? 'Skipped.' });
        continue;
      }
      const band = bandForCode(row.code)!;
      try {
        const j = await createOne({ code: String(row.code), name: row.name, account_type: band.type, normal_balance: band.normal });
        out.push({ code: String(j.code ?? row.code), name: row.name, note: `Created — ${band.label}.` });
      } catch (e: any) {
        out.push({ code: String(row.code), name: row.name, note: e.message });
      }
    }
    setResults(out);
    setBusy(false);
  }

  async function runCustom() {
    setBusy(true);
    try {
      const j = await createOne({
        code: String(codeNum),
        name: name.trim(),
        account_type: band.type,
        normal_balance: contra ? (band.normal === 'debit' ? 'credit' : 'debit') : band.normal,
        description: description.trim() || undefined,
      });
      setResults([{ code: String(j.code ?? codeNum), name: name.trim(), note: 'Created and now in your chart.' }]);
    } catch (e: any) {
      setResults([{ code: '—', name: name.trim(), note: e.message }]);
    }
    setBusy(false);
  }

  const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
  const labelCls = 'block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1';
  const primaryBtn = 'rounded-lg px-4 h-9 text-[13px] font-medium text-white disabled:opacity-50';
  const ghostBtn = 'rounded-lg px-4 h-9 text-[13px] border border-border bg-card text-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Chart of Accounts Wizard</h1>
      </div>

      {loading ? <p className="text-[13px] text-muted-foreground mt-6">Loading your chart…</p> : null}
      {error ? <p className="text-[13px] mt-6" style={{ color: '#b3261e' }}>{error}</p> : null}

      {!loading && !error && results ? (
        <div className="border border-border rounded-xl bg-card mt-6 p-4">
          <h2 className="font-display text-base font-semibold">Done — here is exactly what happened</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={i} className="text-[13px] flex gap-3">
                <span className="font-mono w-14 shrink-0">{r.code}</span>
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">{r.note}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-4">
            <Link href="/admin/accounting/books/accounts" className={`${ghostBtn} inline-flex items-center`} data-tip="Open the full chart of accounts">Open the chart</Link>
            <button type="button" className={ghostBtn} onClick={() => { setResults(null); setMode('choose'); setStep(0); }} data-tip="Run the wizard again">Add more accounts</button>
          </div>
        </div>
      ) : null}

      {!loading && !error && !results && mode === 'choose' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <button type="button" onClick={() => setMode('template')} className="text-left border border-border rounded-xl bg-card p-4" data-tip="Tick the standard accounts you want and the wizard creates them">
            <h2 className="font-display text-base font-semibold">Start from the basic chart</h2>
            <p className="text-[13px] text-muted-foreground mt-1">The standard set of accounts most shops need — cash, receivables, payables, revenue, costs. Tick the ones you want; anything already in your chart is skipped.</p>
          </button>
          <button type="button" onClick={() => { setMode('custom'); setStep(0); }} className="text-left border border-border rounded-xl bg-card p-4" data-tip="Create one account of your own, with your own name and number">
            <h2 className="font-display text-base font-semibold">Add my own account</h2>
            <p className="text-[13px] text-muted-foreground mt-1">One account at a time. You pick what kind it is and which number band it lives in, and name it whatever you like.</p>
          </button>
          <button type="button" onClick={() => setMode('import')} className="text-left border border-border rounded-xl bg-card p-4" data-tip="Bring a chart from another system — one account per row in a spreadsheet file">
            <h2 className="font-display text-base font-semibold">Import from a file</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Moving from another system? Paste or upload a list — one account per row: number, name. The number decides what kind of account it is, and anything already in your chart is skipped, never overwritten.</p>
          </button>
        </div>
      ) : null}

      {!loading && !error && !results && mode === 'import' ? (
        <div className="border border-border rounded-xl bg-card mt-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Import accounts</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              One account per row: <span className="font-mono">number, name</span> — a third column naming the type is optional; the number band decides the kind (1000s Assets, 2000s Liabilities, 3000s Equity, 4000s Revenue, 5000s–8000s Expenses &amp; other). A header row is fine. Nothing is created until you press Import, and existing accounts are skipped — never overwritten.
            </p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="text-[13px]"
              data-tip="Choose a spreadsheet file (.csv) with one account per row"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setImportText(await f.text());
              }}
            />
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              className="border border-border rounded-lg p-3 font-mono text-[12.5px] w-full bg-background"
              placeholder={'1010, Cash in Bank\n1200, Accounts Receivable\n4000, Sales Revenue'}
              data-tip="Or paste the rows straight in — one account per line"
              aria-label="Paste accounts to import"
            />
            {importRows.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {importRows.map((r, i) => (
                  <li key={i} className="text-[13px] flex gap-3">
                    <span className="font-mono w-14 shrink-0">{r.codeRaw || '—'}</span>
                    <span className="font-medium">{r.name || '(unnamed)'}</span>
                    <span className="text-muted-foreground">{r.verdict ?? (r.code !== null ? `Ready — ${bandForCode(r.code)?.label ?? ''}.` : '')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => setMode('choose')} data-tip="Back to the start">Back</button>
            <button type="button" className={primaryBtn} style={{ backgroundColor: '#7258e8' }} disabled={busy || importReady.length === 0} onClick={runImport} data-tip="Create every ready account in the list above">
              {busy ? 'Importing…' : `Import ${importReady.length} account${importReady.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !error && !results && mode === 'template' ? (
        <div className="border border-border rounded-xl bg-card mt-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">The basic chart</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Tick the accounts to create. Ones already in your chart are unticked and marked — they will not be duplicated.</p>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            {TEMPLATE.map((t) => {
              const exists = existingNames.has(t.name.toLowerCase());
              return (
                <label key={t.n} className="flex items-center gap-2 text-[13px] py-1">
                  <input
                    type="checkbox"
                    disabled={exists}
                    checked={picked.has(t.n)}
                    onChange={(e) => setPicked((p) => { const s = new Set(p); if (e.target.checked) s.add(t.n); else s.delete(t.n); return s; })}
                  />
                  <span className={exists ? 'text-muted-foreground' : ''}>{t.name}</span>
                  {exists ? <span className="text-[11px] text-muted-foreground">already in your chart</span> : null}
                </label>
              );
            })}
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => setMode('choose')} data-tip="Back to the start">Back</button>
            <button type="button" className={primaryBtn} style={{ backgroundColor: '#7258e8' }} disabled={busy || picked.size === 0} onClick={runTemplate} data-tip="Create every ticked account in the chart">
              {busy ? 'Creating…' : `Create ${picked.size} account${picked.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !error && !results && mode === 'custom' && step === 0 ? (
        <div className="border border-border rounded-xl bg-card mt-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Step 1 — What kind of account is it?</h2>
            <p className="text-[13px] text-muted-foreground mt-1">The kind decides the number band. Pick the one that matches what this account tracks.</p>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {BANDS.map((b) => (
              <button key={b.key} type="button" onClick={() => setBandKey(b.key)} className={`text-left border rounded-xl p-3 ${bandKey === b.key ? 'border-transparent text-white' : 'border-border bg-card'}`} style={bandKey === b.key ? { backgroundColor: '#7258e8' } : undefined} data-tip={`Numbers ${b.from}–${b.to}`}>
                <span className="text-[13px] font-semibold block">{b.label} <span className="font-mono font-normal">({b.from}–{b.to})</span></span>
                <span className={`text-[12px] block mt-1 ${bandKey === b.key ? 'text-white/85' : 'text-muted-foreground'}`}>{b.hint}</span>
              </button>
            ))}
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => setMode('choose')} data-tip="Back to the start">Back</button>
            <button type="button" className={primaryBtn} style={{ backgroundColor: '#7258e8' }} onClick={() => setStep(1)} data-tip="Continue to name and number">Continue</button>
          </div>
        </div>
      ) : null}

      {!loading && !error && !results && mode === 'custom' && step === 1 ? (
        <div className="border border-border rounded-xl bg-card mt-6">
          <div className="p-4 border-b border-border">
            <h2 className="font-display text-base font-semibold">Step 2 — Name it and give it a number</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{band.label} band, numbers {band.from}–{band.to}. We suggested the next free number — change it to any free number in the band.</p>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Account number</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} inputMode="numeric" />
              {codeError ? <p className="text-[12px] mt-1" style={{ color: '#b3261e' }}>{codeError}</p> : null}
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Account name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Farmers Market Stall Fees" />
            </div>
            <div className="md:col-span-3">
              <label className={labelCls}>What is it for? (optional)</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} placeholder="A short note so future-you remembers why this account exists" />
            </div>
            <label className="flex items-center gap-2 text-[13px] md:col-span-3">
              <input type="checkbox" checked={contra} onChange={(e) => setContra(e.target.checked)} />
              This account <b>reduces</b> another account (like Accumulated Depreciation reduces Equipment)
            </label>
          </div>
          <div className="p-4 border-t border-border flex gap-2">
            <button type="button" className={ghostBtn} onClick={() => setStep(0)} data-tip="Back to picking the kind">Back</button>
            <button type="button" className={primaryBtn} style={{ backgroundColor: '#7258e8' }} disabled={busy || !!codeError || !name.trim()} onClick={runCustom} data-tip="Create this account in the chart">
              {busy ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
