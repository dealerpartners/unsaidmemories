// Resend: POST https://api.resend.com/emails
// Call only from server routes, never from the browser. `from` must be a
// verified sender domain in the Resend account; it is set in env.
export async function sendEmail(input: { to: string; subject: string; html: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? 'UnSaid Memories <orders@unsaidmemories.com>', to: input.to, subject: input.subject, html: input.html }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`);
  return res.json();
}
