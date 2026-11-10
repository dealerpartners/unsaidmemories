'use client';
/* EstimatesScreen — 1:1 port of upload/Contacts_extracted/Contacts/estimates.html
   Document-style estimate editor with 4 views (Edit/Email/Payor/PDF), right sidebar with accordions. */
import { useState } from 'react';

interface EstimatesScreenProps { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }

type View = 'edit' | 'email' | 'payor' | 'pdf';
type Status = 'Pending' | 'Accepted' | 'Converted' | 'Declined' | 'Closed';

export default function EstimatesScreen({ onToast }: EstimatesScreenProps) {
  const [view, setView] = useState<View>('edit');
  const [status, setStatus] = useState<Status>('Pending');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [accordions, setAccordions] = useState<Record<string, boolean>>({});

  const views: { id: View; label: string }[] = [
    { id: 'edit', label: 'Edit' }, { id: 'email', label: 'Email' }, { id: 'payor', label: 'Payor view' }, { id: 'pdf', label: 'PDF view' },
  ];
  const statuses: Status[] = ['Pending', 'Accepted', 'Converted', 'Declined', 'Closed'];
  const accordionList = [
    { id: 'customization', label: 'Customization' },
    { id: 'payment', label: 'Payment options' },
    { id: 'design', label: 'Design' },
    { id: 'progress', label: 'Progress invoicing' },
    { id: 'scheduling', label: 'Scheduling' },
  ];

  function toggleAccordion(id: string) { setAccordions(prev => ({ ...prev, [id]: !prev[id] })); }

  return (
    <div className="flex flex-col h-full">
      {/* HEADER */}
      <header className="h-12 bg-white border-b border-surface-dim flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          {views.map(v => (
            <button key={v.id} className={`px-3 py-2 text-[13px] tab-underline ${view === v.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[13px] text-on-surface-variant">
          <button className="flex items-center gap-1 hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">settings</span>Manage</button>
          <button className="flex items-center gap-1 hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">desktop_windows</span>Take tour</button>
          <button className="flex items-center gap-1 hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">chat_bubble_outline</span>Feedback</button>
        </div>
      </header>

      {/* MAIN AREA */}
      <div className="flex-1 flex overflow-hidden bg-[#faf9fc]">
        {/* LEFT: Document Canvas */}
        <div className="flex-1 overflow-y-auto p-6 flex justify-center">
          {/* EDIT VIEW */}
          {view === 'edit' && (
            <div className="w-full max-w-[900px] space-y-4">
              <div className="bg-[#f4fbfa] border border-[#d9eae8] rounded-lg p-3 flex items-start gap-3">
                <span className="material-symbols-outlined text-[#0a6400]">lightbulb</span>
                <div className="flex-1"><div className="text-[13px] font-semibold text-on-surface">Start work with a signed estimate</div><div className="text-[12px] text-on-surface-variant mt-0.5">Turn on e-signatures so customers sign before they accept—all in the same link you already send. <a href="#" className="text-primary hover:underline">Turn on e-signatures</a></div></div>
                <button className="text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
              <div className="bg-white border border-surface-dim shadow-sm rounded-sm min-h-[800px] flex flex-col relative">
                <div className="p-8 pb-4 flex justify-between items-start"><div><div className="text-[13px] font-bold text-on-surface mb-2 flex items-center gap-1 cursor-pointer hover:underline">Business info: ManageKube LLC <span className="material-symbols-outlined text-[16px]">expand_more</span></div></div><div className="text-[13px] text-on-surface-variant">Amount (hidden): <span className="font-semibold text-on-surface">$0.00</span></div></div>
                <div className="customer-block mx-8 p-6 rounded-md relative mb-6">
                  <div className="relative w-64 mb-4"><select className="w-full h-9 pl-3 pr-8 border border-[#dad9dd] rounded bg-white text-[13px] appearance-none focus:outline-none focus:border-primary"><option>Add customer</option><option>Sample Customer</option></select><span className="material-symbols-outlined absolute right-2 top-2 text-[16px] text-on-surface-variant pointer-events-none">expand_more</span></div>
                  <div className="space-y-2 mb-6"><div className="h-3 w-64 bg-[#e3e8eb] rounded" /><div className="h-3 w-40 bg-[#e3e8eb] rounded" /></div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div><label className="block text-[11px] text-on-surface-variant mb-1">Estimate no.</label><input className="w-full max-w-[200px] h-8 px-2 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary bg-white" defaultValue="1001" /></div>
                      <div><label className="block text-[11px] text-on-surface-variant mb-1">Estimate date</label><div className="relative max-w-[200px]"><input className="w-full h-8 pl-2 pr-8 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary bg-white" defaultValue="11/03/2026" /><span className="material-symbols-outlined absolute right-2 top-1 text-[16px] text-on-surface-variant">calendar_today</span></div></div>
                      <div><label className="block text-[11px] text-on-surface-variant mb-1">Expiration date</label><div className="relative max-w-[200px]"><input className="w-full h-8 pl-2 pr-8 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary bg-white" placeholder="MM/DD/YYYY" /><span className="material-symbols-outlined absolute right-2 top-1 text-[16px] text-on-surface-variant">calendar_today</span></div></div>
                    </div>
                    <div className="space-y-4">
                      <div><label className="block text-[11px] text-on-surface-variant mb-1">Accepted by</label><input className="w-full max-w-[200px] h-8 px-2 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary bg-white" /></div>
                      <div><label className="block text-[11px] text-on-surface-variant mb-1">Accepted date</label><div className="relative max-w-[200px]"><input className="w-full h-8 pl-2 pr-8 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary bg-white" placeholder="MM/DD/YYYY" /><span className="material-symbols-outlined absolute right-2 top-1 text-[16px] text-on-surface-variant">calendar_today</span></div></div>
                    </div>
                  </div>
                  <button className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-white border border-[#dad9dd] rounded flex items-center justify-center shadow-sm text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-[16px]">expand_less</span></button>
                </div>
                <div className="px-8 flex-1">
                  <div className="flex items-center justify-between mb-2"><h3 className="text-[14px] font-semibold">Product or service</h3><div className="flex items-center gap-2 text-on-surface-variant"><button className="hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">grid_on</span></button><button className="hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">content_copy</span></button></div></div>
                  <table className="w-full text-left text-[13px]"><thead><tr className="text-[11px] text-on-surface-variant font-semibold border-b border-surface-dim bg-[#faf9fc]"><th className="py-2 px-2 w-10 border-r border-surface-dim border-dashed" /><th className="py-2 px-2 w-10 border-r border-surface-dim border-dashed">#</th><th className="py-2 px-2 border-r border-surface-dim border-dashed">Product/service</th><th className="py-2 px-2 border-r border-surface-dim border-dashed">Description</th><th className="py-2 px-2 w-16 text-right border-r border-surface-dim border-dashed">Qty</th><th className="py-2 px-2 w-24 text-right border-r border-surface-dim border-dashed">Rate</th><th className="py-2 px-2 w-24 text-right">Amount</th></tr></thead><tbody><tr className="line-row"><td className="py-2 px-2 text-on-surface-variant text-center border-r border-surface-dim border-dashed"><span className="material-symbols-outlined text-[16px] cursor-grab">drag_indicator</span></td><td className="py-2 px-2 text-on-surface-variant border-r border-surface-dim border-dashed">1</td><td className="py-2 px-2 border-r border-surface-dim border-dashed" /><td className="py-2 px-2 border-r border-surface-dim border-dashed" /><td className="py-2 px-2 text-right border-r border-surface-dim border-dashed" /><td className="py-2 px-2 text-right border-r border-surface-dim border-dashed" /><td className="py-2 px-2 text-right" /></tr></tbody></table>
                  <div className="flex items-center gap-2 mt-3 mb-6"><button className="h-8 px-3 border border-surface-dim rounded bg-[#e3e2e6] text-[12px] font-semibold text-on-surface-variant flex items-center gap-1 hover:bg-surface-container">Add product or service <span className="material-symbols-outlined text-[16px]">expand_more</span></button><button className="h-8 px-3 border border-surface-dim rounded bg-[#e3e2e6] text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container">Clear all lines</button></div>
                  <div className="grid grid-cols-2 gap-8 mt-8 pb-8">
                    <div>
                      <div className="flex items-center gap-2 mb-2"><span className="text-[13px] font-semibold">Online payments</span><a href="#" className="text-[12px] text-primary hover:underline">Get started</a></div>
                      <div className="flex items-center gap-2 mb-4 opacity-50 grayscale">{['Apple Pay', 'VISA', 'MC', 'AMEX', 'PayPal', 'venmo', 'affirm'].map(p => <div key={p} className="h-5 px-1 bg-gray-200 border rounded text-[9px] flex items-center">{p}</div>)}</div>
                      <div className="mb-4"><label className="block text-[12px] text-on-surface-variant mb-1">Payment instructions</label><textarea className="w-full h-24 p-2 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary resize-y" placeholder="Tell your customer how you want to get paid." /></div>
                      <div className="mb-4"><label className="block text-[12px] text-on-surface-variant mb-1">Note to customer</label><textarea className="w-full h-20 p-2 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary resize-y" placeholder="Thank you for your business." /></div>
                      <div className="mb-4"><label className="block text-[12px] text-on-surface-variant mb-1">Memo on statement (hidden)</label><textarea className="w-full h-20 p-2 border border-[#dad9dd] rounded text-[13px] focus:outline-none focus:border-primary resize-y" placeholder="This memo will not show up on your estimate, but will appear on the statement." /></div>
                      <div><label className="block text-[12px] font-semibold text-on-surface mb-2">Attachments</label><div className="border border-dashed border-[#dad9dd] rounded-lg p-4 text-center cursor-pointer hover:bg-surface-container-low"><div className="text-[12px] font-semibold text-primary mb-1">Add attachment</div><div className="text-[11px] text-on-surface-variant">Max file size: 20 MB</div></div><div className="text-center mt-2"><a href="#" className="text-[12px] text-primary hover:underline">Show existing</a></div></div>
                    </div>
                    <div className="flex flex-col gap-3 pt-6">
                      <div className="flex justify-between items-center text-[13px]"><span className="text-on-surface-variant">Subtotal</span><span className="font-medium">$0.00</span></div>
                      <div className="flex justify-between items-center text-[13px] font-semibold"><span>Estimate total</span><span>$0.00</span></div>
                      <div className="flex justify-between items-center text-[13px]"><span className="text-on-surface-variant underline decoration-dashed cursor-pointer">Deposit request</span><div className="flex items-center gap-1"><input className="w-16 h-7 px-2 border border-[#dad9dd] rounded text-[13px] text-right focus:outline-none focus:border-primary" defaultValue="0%" /><button className="w-7 h-7 border border-[#dad9dd] rounded bg-[#f4f3f7] text-on-surface-variant flex items-center justify-center">%</button><button className="w-7 h-7 border border-[#dad9dd] rounded bg-[#f4f3f7] text-on-surface-variant flex items-center justify-center">$</button><span className="ml-2 font-medium">$0.00</span></div></div>
                      <div className="text-right mt-2"><a href="#" className="text-[12px] text-primary hover:underline">Edit totals</a></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EMAIL VIEW */}
          {view === 'email' && (
            <div className="w-full max-w-[800px]">
              <div className="bg-white border border-surface-dim shadow-sm rounded-xl overflow-hidden">
                <div className="bg-[#f4fbfa] p-8 text-center border-b border-[#d9eae8]"><h2 className="text-[24px] font-semibold text-on-surface mb-2">ManageKube LLC sent you an estimate</h2><div className="text-[14px] text-on-surface-variant mb-6">Estimate 1001</div><div className="inline-flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-surface-dim shadow-sm min-w-[240px]"><div className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Estimate total</div><div className="text-[32px] font-semibold text-on-surface">$0.00</div></div></div>
                <div className="p-8"><div className="text-[14px] text-on-surface mb-6"><p className="mb-4">Hi Sample Customer,</p><p className="mb-4">Here is the estimate we discussed. Please review and let us know if you have any questions.</p></div><div className="text-center mb-8"><button className="h-10 px-6 bg-primary text-white rounded-full text-[14px] font-semibold hover:bg-primary-container">Review and accept</button></div><div className="border-t border-surface-dim pt-6 mt-8 text-[12px] text-on-surface-variant text-center"><p className="font-semibold text-on-surface mb-1">ManageKube LLC</p><p>123 Business Rd, Suite 100</p><p>hello@managekube.com</p></div></div>
              </div>
            </div>
          )}

          {/* PAYOR VIEW */}
          {view === 'payor' && (
            <div className="w-full max-w-[900px]">
              <div className="bg-white border border-surface-dim shadow-sm rounded-sm p-8">
                <div className="flex justify-between items-start mb-8"><div><h1 className="text-[28px] font-semibold text-primary mb-1">ESTIMATE</h1><div className="text-[14px] font-semibold">ManageKube LLC</div></div><div className="text-right text-[13px]"><div className="text-on-surface-variant uppercase font-semibold mb-1">Estimate total</div><div className="text-[24px] font-semibold">$0.00</div></div></div>
                <div className="grid grid-cols-2 gap-8 mb-8 text-[13px]"><div><div className="text-on-surface-variant font-semibold mb-1 uppercase tracking-wider text-[11px]">From</div><div className="font-semibold mb-1">ManageKube LLC</div><div className="text-on-surface-variant">123 Business Rd<br />Suite 100<br />hello@managekube.com</div></div><div><div className="text-on-surface-variant font-semibold mb-1 uppercase tracking-wider text-[11px]">To</div><div className="font-semibold mb-1">Sample Customer</div><div className="text-on-surface-variant">Acme Corp<br />john@acme.com</div></div></div>
                <div className="bg-[#faf9fc] rounded p-4 mb-8 text-[13px] grid grid-cols-4 gap-4">{[['Estimate no.', '1001'], ['Date', '11/03/2026'], ['Expiration', '—'], ['Amount', '$0.00']].map(([k, v]) => <div key={k}><span className="block text-on-surface-variant text-[11px] uppercase mb-1">{k}</span><span className="font-medium">{v}</span></div>)}</div>
                <table className="w-full text-left text-[13px] mb-8"><thead><tr className="border-b-2 border-surface-dim text-[11px] text-on-surface-variant uppercase font-semibold"><th className="py-2">Product/service</th><th className="py-2">Description</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Rate</th><th className="py-2 text-right">Amount</th></tr></thead><tbody><tr className="border-b border-surface-dim"><td className="py-4" /><td className="py-4" /><td className="py-4 text-right" /><td className="py-4 text-right" /><td className="py-4 text-right" /></tr></tbody></table>
                <div className="flex justify-end mb-12"><div className="w-64 space-y-2 text-[13px]"><div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span>$0.00</span></div><div className="flex justify-between font-semibold border-t border-surface-dim pt-2"><span>Total</span><span>$0.00</span></div></div></div>
                <div className="border-t border-surface-dim pt-8 text-center"><button className="h-10 px-8 bg-primary text-white rounded-full text-[14px] font-semibold hover:bg-primary-container mb-4">Accept Estimate</button></div>
              </div>
            </div>
          )}

          {/* PDF VIEW */}
          {view === 'pdf' && (
            <div className="w-full max-w-[900px]">
              <div className="bg-white shadow-lg w-full max-w-[850px] min-h-[1100px] mx-auto p-[0.75in]">
                <div className="flex justify-between items-start mb-12"><div><div className="text-[24px] font-bold text-primary mb-1">ESTIMATE</div><div className="text-[14px] font-semibold text-gray-800">ManageKube LLC</div><div className="text-[12px] text-gray-500 mt-1">123 Business Rd, Suite 100</div></div><div className="text-right"><div className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Estimate Total</div><div className="text-[28px] font-bold text-gray-900">$0.00</div></div></div>
                <div className="flex justify-between mb-12"><div><div className="text-[10px] uppercase font-bold text-gray-400 mb-2 tracking-widest">Prepared For</div><div className="text-[14px] font-semibold text-gray-800">Sample Customer</div><div className="text-[12px] text-gray-500">Acme Corp</div><div className="text-[12px] text-gray-500">john@acme.com</div></div><div className="text-right"><table className="text-[12px]"><tbody><tr><td className="text-gray-500 pr-4 pb-1">Estimate No.</td><td className="font-semibold text-gray-800 pb-1">1001</td></tr><tr><td className="text-gray-500 pr-4 pb-1">Date</td><td className="font-semibold text-gray-800 pb-1">11/03/2026</td></tr><tr><td className="text-gray-500 pr-4 pb-1">Expiration</td><td className="font-semibold text-gray-800 pb-1">—</td></tr></tbody></table></div></div>
                <table className="w-full text-left text-[12px] mb-8"><thead><tr className="border-b-2 border-gray-300 text-[10px] text-gray-500 uppercase font-bold tracking-widest"><th className="py-3">#</th><th className="py-3">Product/Service</th><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Rate</th><th className="py-3 text-right">Amount</th></tr></thead><tbody><tr className="border-b border-gray-200"><td className="py-4 text-gray-500">1</td><td className="py-4" /><td className="py-4" /><td className="py-4 text-right" /><td className="py-4 text-right" /><td className="py-4 text-right" /></tr></tbody></table>
                <div className="flex justify-end border-t-2 border-gray-300 pt-4"><div className="w-64"><div className="flex justify-between py-1 text-[12px]"><span className="text-gray-500">Subtotal</span><span className="font-semibold text-gray-800">$0.00</span></div><div className="flex justify-between py-2 text-[14px] font-bold border-t border-gray-200 mt-1"><span className="text-gray-800">Total</span><span className="text-gray-900">$0.00</span></div></div></div>
                <div className="mt-16 text-center text-[10px] text-gray-400"><p>Generated by ManageKube LLC</p></div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar */}
        {view === 'edit' && (
          <aside className="w-[340px] bg-white border-l border-surface-dim flex flex-col shrink-0 overflow-y-auto">
            <div className="p-5 border-b border-surface-dim flex items-center justify-between"><h2 className="text-[16px] font-semibold">Estimate 1001</h2><button className="icon-btn"><span className="material-symbols-outlined">close</span></button></div>
            <div className="p-5 flex-1 space-y-4">
              <div className="flex items-center justify-between"><a href="#" className="text-[12px] text-primary hover:underline">Edit default settings</a></div>
              {/* Status Dropdown */}
              <div className="relative inline-block w-full">
                <button className="h-8 px-3 border border-surface-dim rounded bg-white text-[12px] font-semibold flex items-center justify-between w-32 hover:bg-surface-container" onClick={e => { e.stopPropagation(); setStatusMenuOpen(v => !v); }}>{status} <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                {statusMenuOpen && (
                  <div className="row-menu open" style={{ position: 'absolute', top: 36, left: 0, width: 140 }} onClick={e => e.stopPropagation()}>
                    {statuses.map(s => <button key={s} className={s === status ? 'font-semibold' : ''} onClick={() => { setStatus(s); setStatusMenuOpen(false); onToast(`Status changed to ${s}`); }}>{s}</button>)}
                  </div>
                )}
              </div>
              {/* Accordions */}
              <div className="space-y-3 mt-4">
                {accordionList.map(acc => (
                  <div key={acc.id} className="border border-surface-dim rounded-lg bg-white overflow-hidden">
                    <button className="w-full px-4 py-3 flex items-center justify-between text-[14px] font-semibold hover:bg-surface-container-low" onClick={() => toggleAccordion(acc.id)}>{acc.label}<span className="material-symbols-outlined text-on-surface-variant">{accordions[acc.id] ? 'expand_less' : 'expand_more'}</span></button>
                    {accordions[acc.id] && (
                      <div className="border-t border-surface-dim p-4 space-y-3 text-[13px]">
                        {acc.id === 'customization' && <>
                          {[['Ship to', false], ['Estimate status', true], ['Estimate number', true], ['Estimate date', true], ['Expiration date', true], ['Customer email', false], ['Customer contact info', false]].map(([label, on]) => (
                            <div key={label as string} className="flex items-center justify-between"><span>{label}</span><label className="switch"><input type="checkbox" defaultChecked={on as boolean} /><span className="slider" /></label></div>
                          ))}
                          <div className="flex items-center justify-between"><span>Require e-signature <span className="bg-[#d81b60] text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ml-1">New</span></span><label className="switch"><input type="checkbox" /><span className="slider" /></label></div>
                        </>}
                        {acc.id === 'payment' && <>
                          <p className="text-[13px] text-on-surface-variant mb-3">Accept cards, bank transfers, and more to get paid faster online.</p>
                          <div className="flex gap-2 mb-4 opacity-70">{['VISA', 'MC', 'AMEX', 'PayPal', 'venmo'].map(p => <div key={p} className="h-6 px-1 border rounded flex items-center font-bold text-[10px]">{p}</div>)}</div>
                          <button className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold text-primary hover:bg-surface-container mb-4">Get started</button>
                          {[['Estimate total', true], ['Discount', false], ['Shipping fee', false]].map(([label, on]) => (
                            <div key={label as string} className="flex items-center justify-between"><span>{label}</span><label className="switch"><input type="checkbox" defaultChecked={on as boolean} /><span className="slider" /></label></div>
                          ))}
                        </>}
                        {acc.id === 'design' && <>
                          <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Modernized template</span><a href="#" className="text-[12px] text-primary hover:underline">Remove default</a></div>
                          <label className="flex items-center gap-2 mt-2"><input type="radio" name="template" defaultChecked /> Modern</label>
                          <div className="flex items-center justify-between mt-2"><label className="flex items-center gap-2"><input type="radio" name="template" /> Standard</label><a href="#" className="text-[12px] text-primary hover:underline">Add/Edit</a></div>
                          <div className="pt-4 border-t border-surface-dim"><div className="flex items-center justify-between mb-2"><span className="text-[13px] font-semibold">Color</span><label className="switch"><input type="checkbox" /><span className="slider" /></label></div><div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 rounded-full bg-orange-500 border-2 border-white shadow ring-2 ring-orange-500 cursor-pointer" /><input className="w-20 h-7 px-2 border border-surface-dim rounded text-[12px] focus:outline-none" defaultValue="#ff8c00" /></div></div>
                          <div className="pt-2"><label className="block text-[13px] font-semibold mb-2">Font</label><select className="w-full h-8 px-2 border border-surface-dim rounded text-[13px] focus:outline-none"><option>Helvetica Neue</option><option>Arial</option></select></div>
                        </>}
                        {acc.id === 'progress' && <div className="text-[13px]"><div className="flex justify-between items-start mb-2"><span className="text-on-surface-variant">Send multiple, partial invoices against an estimate.</span><span className="font-semibold">Off</span></div><a href="#" className="text-[12px] text-primary hover:underline">Manage in settings</a></div>}
                        {acc.id === 'scheduling' && <>
                          <div className="flex items-center gap-1 text-[13px] font-semibold mb-2">More options <span className="material-symbols-outlined text-[16px] text-on-surface-variant">info</span></div>
                          {[['Print later', false], ['Send later', false]].map(([label, on]) => (
                            <div key={label as string} className="flex items-center justify-between"><span>{label}</span><label className="switch"><input type="checkbox" defaultChecked={on as boolean} /><span className="slider" /></label></div>
                          ))}
                        </>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* FOOTER */}
      <footer className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0 z-20">
        <div className="w-1/3" />
        <div className="flex-1 flex justify-center"><button className="text-[13px] text-on-surface font-semibold hover:underline" onClick={() => setView('pdf')}>Print or download</button></div>
        <div className="w-1/3 flex justify-end items-center gap-3">
          <div className="flex relative">
            <button className="h-9 px-4 border border-surface-dim rounded-l bg-white text-[13px] font-semibold hover:bg-surface-container" onClick={() => onToast('Estimate saved')}>Save</button>
            <button className="h-9 px-2 border border-l-0 border-surface-dim rounded-r bg-white hover:bg-surface-container" onClick={e => { e.stopPropagation(); setSaveMenuOpen(v => !v); }}><span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span></button>
            {saveMenuOpen && (
              <div className="row-menu open" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setSaveMenuOpen(false); setView('edit'); onToast('Saved — new estimate started'); }}>Save and new</button>
                <button onClick={() => { setSaveMenuOpen(false); onToast('Saved and closed'); }}>Save and close</button>
              </div>
            )}
          </div>
          <div className="flex relative">
            <button className="h-9 px-5 bg-primary text-white text-[13px] font-semibold rounded-l hover:bg-primary-container flex items-center gap-1" onClick={() => setView('email')}>Review and send</button>
            <button className="h-9 px-2 bg-primary text-white rounded-r hover:bg-primary-container border-l border-primary-container" onClick={e => { e.stopPropagation(); setSendMenuOpen(v => !v); }}><span className="material-symbols-outlined text-[18px]">expand_more</span></button>
            {sendMenuOpen && (
              <div className="row-menu open" style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4 }} onClick={e => e.stopPropagation()}>
                <button onClick={() => { setSendMenuOpen(false); setView('email'); }}>Review and send</button>
                <button onClick={() => { setSendMenuOpen(false); setView('email'); onToast('Scheduled — review, then send from the email preview'); }}>Schedule send</button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
