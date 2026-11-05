"use client";

// Help Center document renderer: the site's doc-content treatment applied
// to the library Charter's Markdown.
//   - 16px Inter body on leading-relaxed (the site's reading size)
//   - Inter display headings: H2 24px / H3 20px,
//     section separation mt-12 / mt-8
//   - teal dot bullets + filled ink circle number badges + hairline
//     nested rails (driven by the .hc-prose CSS in globals.css)
//   - numbered TOC anchors on H2/H3 (ids for deep links)
//   - the Charter's five callouts (> [!NOTICE] …) as labelled boxes with
//     lucide icons, uppercase micro labels and the center's palette
//   - tables, quotes and code in the Help Center tokens
// The scoped .hc-scope wrapper supplies the fonts and colors (the site's
// global palette); this component only shapes density and rhythm.

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Info, Mail, Scale, TriangleAlert } from "lucide-react";

export type HCTone = "site" | "portal";

export interface TocEntry {
  depth: 2 | 3;
  text: string;
  id: string;
}

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Extract the H2/H3 outline of a Markdown body for the table of contents. */
export function extractToc(body: string): TocEntry[] {
  const out: TocEntry[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[2].replace(/\*\*/g, "").replace(/`/g, "");
    out.push({ depth: m[1].length as 2 | 3, text, id: headingId(text) });
  }
  return out;
}

const CALLOUT_META: Record<
  string,
  { label: string; Icon: any; box: string; iconClass: string; labelClass: string }
> = {
  DEFINITION: {
    label: "Definition",
    Icon: BookOpen,
    box: "border-border bg-card",
    iconClass: "text-muted-foreground",
    labelClass: "text-foreground",
  },
  NOTICE: {
    label: "Notice",
    Icon: Info,
    box: "border-accent/40 bg-accent/10",
    iconClass: "text-accent",
    labelClass: "text-accent",
  },
  WARNING: {
    label: "Warning",
    Icon: TriangleAlert,
    box: "border-[oklch(0.8_0.13_75)] bg-[oklch(0.95_0.05_85)]",
    iconClass: "text-[oklch(0.55_0.14_65)]",
    labelClass: "text-[oklch(0.42_0.12_60)]",
  },
  LIABILITY: {
    label: "Liability",
    Icon: Scale,
    box: "border-ink bg-ink text-on-dark",
    iconClass: "text-accent",
    labelClass: "text-accent",
  },
  CONTACT: {
    label: "Contact",
    Icon: Mail,
    box: "border-accent/50 bg-card",
    iconClass: "text-accent",
    labelClass: "text-foreground",
  },
};

/**
 * Rewrite Charter callout blockquotes into fenced blocks the renderer can
 * intercept:  ```callout-notice … ```  (the fence content is the callout's
 * Markdown, rendered recursively inside the callout box).
 */
export function expandCallouts(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = lines[i].match(/^>\s*\[!(DEFINITION|NOTICE|WARNING|LIABILITY|CONTACT)\]\s*(.*)$/);
    if (!start) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const type = start[1].toLowerCase();
    const content: string[] = [];
    if (start[2]) content.push(start[2]);
    i++;
    while (i < lines.length && /^>/.test(lines[i])) {
      content.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    out.push("```callout-" + type, ...content, "```", "");
  }
  return out.join("\n");
}

function CalloutBox({ type, text, tone }: { type: string; text: string; tone: HCTone }) {
  const meta = CALLOUT_META[type.toUpperCase()] ?? CALLOUT_META.NOTICE;
  const { Icon } = meta;
  const dark = type.toUpperCase() === "LIABILITY";
  return (
    <div className={`my-5 flex gap-3 rounded-sm border px-4 py-3.5 ${meta.box}`} role="note">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconClass}`} strokeWidth={1.6} aria-hidden />
      <div className="min-w-0">
        <p className={`mb-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] ${meta.labelClass}`}>
          {meta.label}
        </p>
        <div className={dark ? "text-on-dark-muted [&_p]:text-on-dark-muted" : ""}>
          <HCDocumentBody body={text} tone={tone} nested />
        </div>
      </div>
    </div>
  );
}

function textOf(children: React.ReactNode): string {
  if (children == null) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (React.isValidElement(children)) return textOf((children.props as any)?.children);
  return "";
}

export function HCDocumentBody({
  body,
  tone = "site",
  nested = false,
}: {
  body: string;
  tone?: HCTone;
  nested?: boolean;
}) {
  const portal = tone === "portal";
  const prose = portal ? "text-[15px] leading-[1.75]" : "text-base leading-relaxed";

  const components: Record<string, any> = {
    h1: ({ node, children, ...p }: any) => (
      <h1 className="mb-1 mt-12 scroll-mt-28 text-2xl text-foreground" {...p}>
        {children}
      </h1>
    ),
    h2: ({ node, children, ...p }: any) => (
      <h2 id={headingId(textOf(children))} className="mb-1 mt-12 scroll-mt-28 text-2xl text-foreground" {...p}>
        {children}
      </h2>
    ),
    h3: ({ node, children, ...p }: any) => (
      <h3 id={headingId(textOf(children))} className="mb-1 mt-8 scroll-mt-28 text-xl text-foreground" {...p}>
        {children}
      </h3>
    ),
    p: ({ node, ...p }: any) => <p className="mt-4 text-foreground/90" {...p} />,
    a: ({ node, ...p }: any) => (
      <a className="break-words font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:text-accent/80" {...p} />
    ),
    // List markers (teal dots, number circle badges, nested rails) are
    // supplied by the .hc-prose CSS in globals.css — the components map
    // stays out of their way.
    strong: ({ node, ...p }: any) => <strong className="font-semibold text-foreground" {...p} />,
    blockquote: ({ node, ...p }: any) => (
      <blockquote className="my-4 border-l-2 border-accent/40 bg-accent/5 px-5 py-3 italic text-foreground/80" {...p} />
    ),
    hr: () => <hr className="my-8 border-border" />,
    table: ({ node, ...p }: any) => (
      <div className="my-5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm" {...p} />
      </div>
    ),
    tr: ({ node, ...p }: any) => <tr className="border-b border-border last:border-0" {...p} />,
    th: ({ node, ...p }: any) => (
      <th className="border-b border-border bg-secondary px-4 py-3 text-left font-semibold text-foreground" {...p} />
    ),
    td: ({ node, ...p }: any) => <td className="border-b border-border px-4 py-3 align-top text-foreground/90" {...p} />,
    code: ({ node, className, children, ...p }: any) => {
      const isBlock = /language-/.test(String(className ?? ""));
      if (isBlock) return <code className={className} {...p}>{children}</code>;
      return (
        <code className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[12.5px] text-foreground" {...p}>
          {children}
        </code>
      );
    },
    pre: ({ node, children, ...p }: any) => {
      // Intercept the callout fences produced by expandCallouts().
      const codeEl = React.Children.toArray(children).find((c) =>
        React.isValidElement(c),
      ) as React.ReactElement<any> | undefined;
      const cls = String(codeEl?.props?.className ?? "");
      const m = cls.match(/language-callout-([a-z]+)/);
      if (m) {
        return <CalloutBox type={m[1]} text={textOf(codeEl?.props?.children).replace(/\n$/, "")} tone={tone} />;
      }
      return (
        <pre className="my-4 overflow-x-auto rounded-sm bg-ink p-4 font-mono text-[12.5px] leading-relaxed text-on-dark-muted" {...p}>
          {children}
        </pre>
      );
    },
    img: ({ node, ...p }: any) => <img className="h-auto max-w-full" {...p} alt={p.alt || ""} />,
  };

  return (
    <div className={`hc-prose ${nested ? "hc-nested" : prose}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {expandCallouts(body)}
      </ReactMarkdown>
    </div>
  );
}

/** Numbered contents rail for a document body (Help Center treatment). */
export function HCToc({ body, className = "" }: { body: string; className?: string }) {
  const toc = extractToc(body).filter((e) => e.depth === 2);
  if (toc.length < 2) return null;
  return (
    <nav aria-label="Contents" className={className}>
      <p className="mb-3 text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        Contents
      </p>
      <ol className="space-y-1.5">
        {toc.map((entry, i) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className="group flex items-baseline gap-2.5 text-sm leading-snug text-muted-foreground hover:text-accent"
            >
              <span className="font-mono text-[11px] font-semibold text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="group-hover:underline group-hover:underline-offset-2">
                {entry.text.replace(/^Article\s+\d+\s*:\s*/, "")}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
