// Metricool: POST https://app.metricool.com/api/v2/scheduler/posts
// Auth is a browser-connected brand token in env/vault, never in the DB.
export async function createMetricoolDraft(input: { text: string; scheduledAt: string; networks: string[]; mediaUrls?: string[] }) {
  const res = await fetch('https://app.metricool.com/api/v2/scheduler/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.METRICOOL_USER_TOKEN}` },
    body: JSON.stringify({ publicationDate: input.scheduledAt, text: input.text, providers: input.networks.map(n => ({ network: n })), draft: true }),
  });
  if (!res.ok) throw new Error(`Metricool draft failed: ${res.status}`);
  return res.json();
}
