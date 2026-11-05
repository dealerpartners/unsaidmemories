'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';

type Generation = {
  id: string;
  seller_id: string;
  seller_name: string;
  tax_id_on_file: boolean;
  tax_year: number;
  gross_amount: number;
  transaction_count: number;
  basis: string;
  filing_status: string;
  tax_document_id: string | null;
  generated_at: string;
  updated_at: string;
};

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// E3 · Generated Form 1099-K view. Renders the platform-generated form from
// the generation record (seller_1099k_generations). This is the artifact a
// generated register row's document_url points at. Filing honesty: the
// platform generates this form from recorded seller orders; it does not
// transmit it to the IRS — the filing state is printed on the form itself.
export default function Generated1099KPage({ params }: { params: Promise<{ id: string }> }) {
  const [gen, setGen] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { id } = await params;
      try {
        const r = await fetch(`/api/admin/sellers/tax-documents/generate?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
        if (!j.generation) throw new Error('Generation record not found.');
        if (!cancelled) setGen(j.generation);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the generated form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/admin/sellers/tax" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to seller tax desk
        </Link>
        {gen && (
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted">
            <Printer className="size-3.5" /> Print / save PDF
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading generated form…</p>
      ) : error ? (
        <p className="text-[13px] text-red-600">{error}</p>
      ) : gen ? (
        <div className="rounded-xl border border-border bg-card print:border-black">
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <h1 className="text-[18px] font-bold">Form 1099-K</h1>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-muted-foreground">Tax year</p>
              <p className="text-[16px] font-bold">{gen.tax_year}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
            <div className="rounded-lg border border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payer</p>
              <p className="mt-1 text-[14px] font-medium">UnSaid Memories (platform)</p>
              <p className="text-[12px] text-muted-foreground">Third-party settlement organization</p>
            </div>
            <div className="rounded-lg border border-border">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payee</p>
              <p className="mt-1 text-[14px] font-medium">{gen.seller_name}</p>
              <p className="text-[12px] text-muted-foreground">
                Tax ID on file: {gen.tax_id_on_file ? 'Yes (last 4 held on the seller record)' : 'No — W-9 outstanding'}
              </p>
            </div>
          </div>

          <div className="adm-table-wrap"><table className="adm-table">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">1a · Gross amount of payment card / third party network transactions</td>
                <td className="py-3 text-right font-semibold">{fmtMoney(gen.gross_amount)}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">4 · Number of payment transactions</td>
                <td className="py-3 text-right font-semibold">{gen.transaction_count}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Computation basis</td>
                <td className="py-3 text-right">{gen.basis}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">Generated</td>
                <td className="py-3 text-right">{new Date(gen.generated_at).toLocaleString()}</td>
              </tr>
              <tr>
                <td className="py-3 pr-4 text-muted-foreground">IRS filing status</td>
                <td className="py-3 text-right font-semibold uppercase">{gen.filing_status.replace('_', ' ')}</td>
              </tr>
            </tbody>
          </table></div>

          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-[12px] text-amber-900 print:bg-transparent print:border print:border-black">
            This form was generated by the platform from recorded seller orders. It has <strong>not</strong> been
            filed with the IRS by the platform — filing status above is the record's actual state.
          </p>
        </div>
      ) : null}
    </div>
  );
}
