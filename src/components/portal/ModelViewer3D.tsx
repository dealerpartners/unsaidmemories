'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, ExternalLink } from 'lucide-react';

// ============================================================================
// Interactive 3D model viewer (§6.16.2.2.4 / §6.16.3.1.2) — renders a
// glTF/GLB model with Google's <model-viewer> web component (orbit,
// zoom, AR where the device supports it). The component script loads
// once from the CDN; if it cannot load (offline, blocked), the surface
// falls back to a plain link to the model file — the model is never
// faked with a picture of one.
// ============================================================================

const SCRIPT_SRC =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
let scriptState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
const waiters: Array<(ok: boolean) => void> = [];

function loadModelViewer(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).customElements?.get('model-viewer')) {
    scriptState = 'ready';
    return Promise.resolve(true);
  }
  if (scriptState === 'ready') return Promise.resolve(true);
  if (scriptState === 'failed') return Promise.resolve(false);
  return new Promise((resolve) => {
    waiters.push(resolve);
    if (scriptState === 'loading') return;
    scriptState = 'loading';
    const s = document.createElement('script');
    s.type = 'module';
    s.src = SCRIPT_SRC;
    s.onload = () => {
      scriptState = 'ready';
      waiters.splice(0).forEach((w) => w(true));
    };
    s.onerror = () => {
      scriptState = 'failed';
      waiters.splice(0).forEach((w) => w(false));
    };
    document.head.appendChild(s);
  });
}

export default function ModelViewer3D({
  src,
  title,
  poster,
}: {
  src: string;
  title?: string | null;
  poster?: string | null;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadModelViewer().then((ok) => {
      if (live) setState(ok ? 'ready' : 'failed');
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !hostRef.current) return;
    hostRef.current.innerHTML = '';
    const el = document.createElement('model-viewer');
    el.setAttribute('src', src);
    el.setAttribute('alt', title || 'Interactive 3D model');
    if (poster) el.setAttribute('poster', poster);
    el.setAttribute('camera-controls', '');
    el.setAttribute('auto-rotate', '');
    el.setAttribute('ar', '');
    el.setAttribute('shadow-intensity', '1');
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.backgroundColor = 'transparent';
    hostRef.current.appendChild(el);
  }, [state, src, title, poster]);

  if (state === 'failed') {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 p-4 text-center">
        <Box className="size-6 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">
          The 3D viewer could not load in this browser.
        </p>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Open the model file <ExternalLink className="size-3.5" />
        </a>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted/30">
      {state === 'loading' && (
        <p className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
          Loading 3D model…
        </p>
      )}
      <div ref={hostRef} className="absolute inset-0" aria-label={title || 'Interactive 3D model'} />
    </div>
  );
}
