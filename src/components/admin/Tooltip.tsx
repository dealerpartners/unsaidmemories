"use client";

/**
 * Tooltip system — every action in the admin explains itself in plain
 * language (see docs/ux-baseline.md, rule 2).
 *
 * How it works: any element anywhere in the admin can carry a
 * `data-tip="Plain-language explanation."` attribute. The single
 * <TooltipHost /> mounted by FabricShell listens at the document
 * level (event delegation), so pages and components never import
 * anything — they just add the attribute. The bubble appears on
 * mouse hover and on keyboard focus, carries role="tooltip", and is
 * wired to its target with aria-describedby while visible.
 *
 * The host renders in every shell mode (full shell, embed frames,
 * and the studio's bare frame), so tooltips work inside workspace
 * tab frames and in the Design Studio too.
 *
 * Styling lives in fabric-shell.css (.tip-bubble): dark ink bubble,
 * DM Sans text, purple accent edge — the fabric design language.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

interface TipState {
  text: string;
  left: number;
  top: number;
  below: boolean;
}

const SHOW_DELAY_MS = 350;

export default function TooltipHost() {
  const [tip, setTip] = useState<TipState | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(
    `tip-${Math.random().toString(36).slice(2, 9)}`,
  );

  useEffect(() => {
    const findTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      const el = node.closest("[data-tip]");
      return el instanceof HTMLElement ? el : null;
    };

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const hide = () => {
      clearTimer();
      if (targetRef.current) {
        targetRef.current.removeAttribute("aria-describedby");
        targetRef.current = null;
      }
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute("data-tip")?.trim();
      if (!text) return;
      if (targetRef.current && targetRef.current !== el) {
        targetRef.current.removeAttribute("aria-describedby");
      }
      targetRef.current = el;
      el.setAttribute("aria-describedby", idRef.current);
      const r = el.getBoundingClientRect();
      const below = r.top < 110; // not enough room above — flip below
      const left = Math.min(
        Math.max(r.left + r.width / 2, 150),
        window.innerWidth - 150,
      );
      setTip({
        text,
        left,
        top: below ? r.bottom + 9 : r.top - 9,
        below,
      });
    };

    const scheduleShow = (el: HTMLElement) => {
      clearTimer();
      timerRef.current = setTimeout(() => show(el), SHOW_DELAY_MS);
    };

    const onMouseOver = (e: MouseEvent) => {
      const el = findTarget(e.target);
      if (!el) {
        if (targetRef.current) hide();
        return;
      }
      if (el === targetRef.current) return;
      scheduleShow(el);
    };

    const onMouseOut = (e: MouseEvent) => {
      const current = targetRef.current;
      if (!current) return;
      const related = e.relatedTarget;
      if (related instanceof Node && current.contains(related)) return;
      if (findTarget(related) === current) return;
      hide();
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = findTarget(e.target);
      if (el) {
        clearTimer();
        show(el);
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      if (targetRef.current && !targetRef.current.contains(e.relatedTarget as Node)) {
        hide();
      }
    };

    const onPointerDown = (e: Event) => {
      // A click means the action is happening — the explanation has
      // done its job, and a stale bubble over the result is noise.
      if (targetRef.current && findTarget(e.target) === targetRef.current) hide();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    const onScrollOrResize = () => {
      if (targetRef.current) hide();
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      clearTimer();
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      id={idRef.current}
      className={`tip-bubble${tip.below ? " tip-below" : ""}`}
      style={{
        left: tip.left,
        top: tip.top,
      }}
    >
      {tip.text}
    </div>
  );
}

/**
 * Tip — convenience wrapper for tipping a non-interactive element
 * (a label, a badge, a chunk of text). Interactive elements should
 * carry `data-tip` directly instead of being wrapped.
 */
export function Tip({
  text,
  children,
  className,
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span data-tip={text} className={className} style={{ display: "inline-flex" }}>
      {children}
    </span>
  );
}
