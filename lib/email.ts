// Transactional email via Resend. Single sender across all flows so
// rate limits + reputation accumulate against one identity. We use a
// tiny inline template — the brand voice is consistent with the rest
// of the site (Space Grotesk-ish copy, sparse, accent green link).
//
// Setup:
//   RESEND_API_KEY   — env var, from resend.com/api-keys
//   FROM_ADDRESS     — set below; must be verified on Resend (the
//                      from-domain must match a domain you proved
//                      ownership of, otherwise sends 403). For dev,
//                      Resend lets you send to your own email with
//                      onboarding@resend.dev without a verified
//                      domain — we use that fallback when noztos.com
//                      hasn't been added yet.
//
// All send* functions fail-soft: a network glitch logs a warning and
// returns; the caller never throws. For password reset that's a
// security trade-off: we tell the user "if the email exists, we sent
// a link" regardless. A genuine deliverability problem will surface
// as users complaining; a transient blip silently retries on the next
// click.

import { Resend } from 'resend'

const FROM_ADDRESS = process.env.RESEND_FROM ?? 'Noztos <onboarding@resend.dev>'
const REPLY_TO = process.env.RESEND_REPLY_TO ?? 'hello@noztos.com'

let cached: Resend | null = null
function client(): Resend | null {
  if (cached) return cached
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set; emails will no-op.')
    return null
  }
  cached = new Resend(key)
  return cached
}

export async function sendPasswordResetEmail(opts: {
  to: string
  resetUrl: string
  // Optional username for personalisation. Falls back to "there" so
  // we never address the user as null.
  name?: string | null
}): Promise<void> {
  const c = client()
  if (!c) return
  const name = opts.name?.trim() || 'there'
  const subject = 'Reset your noztos password'
  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#0d0e15;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#f0f0f3;">
  <div style="max-width:520px;margin:40px auto;padding:36px 32px;background:#15161d;border:1px solid #2a2c38;border-radius:8px;">
    <div style="font-size:18px;font-weight:600;letter-spacing:-0.01em;color:#f0f0f3;">noztos</div>
    <h1 style="font-size:22px;font-weight:500;margin:28px 0 10px;color:#f0f0f3;letter-spacing:-0.01em;">Reset your password</h1>
    <p style="font-size:14px;line-height:1.6;color:#aab;margin:0 0 22px;">
      Hi ${escapeHtml(name)}, click the link below to set a new password for your noztos account. The link is good for one hour.
    </p>
    <a href="${opts.resetUrl}" style="display:inline-block;padding:11px 18px;background:#caff36;color:#000;text-decoration:none;font-weight:500;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;border-radius:4px;">Reset password →</a>
    <p style="font-size:12px;line-height:1.6;color:#777;margin:24px 0 0;">
      Or paste this URL into your browser:<br>
      <span style="word-break:break-all;color:#aab;">${escapeHtml(opts.resetUrl)}</span>
    </p>
    <p style="font-size:11px;color:#666;margin:28px 0 0;">
      If you didn't request a password reset, you can safely ignore this email — your account isn't affected.
    </p>
  </div>
</body>
</html>`
  try {
    await c.emails.send({
      from: FROM_ADDRESS,
      to: opts.to,
      replyTo: REPLY_TO,
      subject,
      html,
    })
  } catch (err) {
    console.warn(`[email] sendPasswordResetEmail to=${opts.to} failed:`, err)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
