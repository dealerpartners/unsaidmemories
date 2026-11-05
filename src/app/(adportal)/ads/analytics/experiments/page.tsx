"use client";

export default function Page() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Experiments</h1>
          <p className="mt-1 text-sm text-neutral-500">Measure incremental impact with split tests and lift studies.</p>
        </div>
        <button disabled className="flex h-9 items-center gap-2 rounded-lg bg-neutral-200 px-4 text-sm font-medium text-neutral-400" title="Experiments aren't available in this system yet">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          Create Experiment
        </button>
      </div>
      <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-600">
        <p>No experiments are running, and this system doesn't have an experiment engine yet — there's no split-test or lift-study machinery behind this page (the split-test toggles in the campaign wizards are inert for the same reason).</p>
        <p className="mt-2">When experiments are built, they'll appear here with their real confidence and duration figures.</p>
      </div>
    </div>
  );
}
