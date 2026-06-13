// Vercel Serverless Function — sends an email to the studio when a client
// starts or finishes reviewing. The Resend API key lives only here (server-side
// env var), never in the browser.
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   RESEND_API_KEY   your Resend API key
//   NOTIFY_TO        where to send the alert (e.g. victor.gil.aguado@gmail.com)
//   NOTIFY_FROM      optional, defaults to onboarding@resend.dev

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { project = 'a gallery', reviewer = 'Someone', event = 'start', summary = {} } = req.body || {};

  const KEY = process.env.RESEND_API_KEY;
  const TO = process.env.NOTIFY_TO;
  const FROM = process.env.NOTIFY_FROM || 'VG Studio <onboarding@resend.dev>';

  // Not configured yet → no-op (so deploying before the key exists is safe)
  if (!KEY || !TO) {
    res.status(200).json({ skipped: 'not configured' });
    return;
  }

  const started = event === 'start';
  const subject = started
    ? `🟢 ${reviewer} started reviewing ${project}`
    : `✅ ${reviewer} finished reviewing ${project}`;

  const row = (label, value, color) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#888;font-size:13px">${label}</td>` +
    `<td style="padding:4px 0;font-size:13px;font-weight:600;color:${color || '#111'}">${value}</td></tr>`;

  const stats = started ? '' : `
    <table style="border-collapse:collapse;margin-top:14px">
      ${row('Reviewed', `${summary.reviewed ?? 0} / ${summary.total_photos ?? 0}`)}
      ${row('★ Starred', summary.starred ?? 0)}
      ${row('● Selects', summary.selects ?? 0, '#2ECC71')}
      ${row('● Retouch', summary.retouch ?? 0, '#3498DB')}
      ${row('Notes', summary.notes ?? 0)}
    </table>`;

  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:460px">
      <p style="font-size:15px;color:#111;margin:0 0 6px">
        <b>${reviewer}</b> ${started ? 'just opened' : 'finished reviewing'} <b>${project}</b>.
      </p>
      ${stats}
      <p style="margin-top:18px">
        <a href="https://gallery.victorgilstudio.com/admin"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px">
          Open admin
        </a>
      </p>
      <p style="color:#aaa;font-size:11px;margin-top:20px">VG Studio — Client Gallery</p>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], subject, html })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(502).json({ error: 'resend', detail: data });
      return;
    }
    res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
