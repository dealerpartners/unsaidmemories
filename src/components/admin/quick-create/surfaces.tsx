'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

// ============================================================================
// Quick-create surface primitives — the owner's QUICK_ACTIONS.html
// converted to native components: a 580px right drawer sliding over a
// dim backdrop, and a full-screen overlay, for the dedicated creation
// rails. His geometry and tokens are kept verbatim: backdrop
// rgba(16,24,40,0.4), drawer 580px / shadow -4px 0 24px rgba(0,0,0,0.1)
// / 0.25s cubic-bezier(0.16,1,0.3,1) slide, overlay fade 0.15s, form
// labels 11px uppercase #5f6b76, inputs #d0d5dd borders with the shell
// green (#0a6400) focus ring. Esc and backdrop click close every
// surface (his script's behavior). Mounted at the /admin page level by
// QuickCreate.tsx — the GlobalShell is untouched.
// ============================================================================

/** Mount/visibility pair so close animations finish before unmount. */
export function useSurface(open: boolean, closeMs = 260) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), closeMs);
    return () => clearTimeout(t);
  }, [open, closeMs]);
  return { mounted, shown };
}

export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

export function Backdrop({ open, shown, onClose }: { open: boolean; shown: boolean; onClose: () => void }) {
  if (!open && !shown) return null;
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      className="fixed inset-0 z-[90] transition-opacity duration-200"
      style={{ backgroundColor: 'rgba(16,24,40,0.4)', opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
    />
  );
}

/** His .form-label / .form-input, as shared classes. */
export const qcLabelCls = 'block text-[11px] font-semibold uppercase mb-1';
export const qcLabelStyle = { color: '#5f6b76', letterSpacing: '0.3px' } as const;
export const qcInputCls =
  'w-full rounded-md text-[13px] text-[#1a1c1e] bg-white outline-none border border-[#d0d5dd] px-[11px] py-[9px] focus:border-[#0a6400] focus:ring-[3px] focus:ring-[rgba(10,100,0,0.1)] disabled:opacity-60';

export const qcSaveBtnCls =
  'px-4 py-2 bg-[#171420] text-white text-sm font-semibold rounded hover:bg-[#000000] disabled:opacity-60 inline-flex items-center gap-1.5';
export const qcCancelBtnCls = 'px-4 py-2 text-sm font-semibold text-[#4b5563] hover:text-[#1a1c1e]';

export function QcError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 text-[13px]" style={{ color: '#b3261e' }}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{text}</span>
    </p>
  );
}

export function QcSuccess({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 text-[13px]" style={{ color: '#0a6400' }}>
      <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> <span>{text}</span>
    </p>
  );
}

/**
 * The 580px right drawer: header band (icon + title + ×), scrolling
 * body, footer band — his drawer chrome exactly.
 */
export function DrawerShell({
  open,
  onClose,
  icon,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { mounted, shown } = useSurface(open);
  useEscape(open, onClose);
  if (!mounted) return null;
  return (
    <>
      <Backdrop open={mounted} shown={shown} onClose={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="fixed top-0 right-0 bottom-0 bg-white z-[100] flex flex-col w-[580px] max-w-[100vw]"
        style={{
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
          transform: shown ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div className="h-16 border-b border-[#e5e7eb] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="font-semibold text-lg text-[#1f2937]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#9ca3af] hover:text-[#4b5563]">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 px-6 py-6 overflow-y-auto">{children}</div>
        <div className="h-16 border-t border-[#e5e7eb] flex items-center justify-end gap-3 px-6 shrink-0">{footer}</div>
      </div>
    </>
  );
}

/** The full-screen overlay (Invoice / Bill in his file). */
export function OverlayShell({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const { mounted, shown } = useSurface(open, 180);
  useEscape(open, onClose);
  if (!mounted) return null;
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed inset-0 z-[100] bg-white flex flex-col transition-opacity duration-150"
      style={{ opacity: shown ? 1 : 0 }}
    >
      {children}
    </div>
  );
}
