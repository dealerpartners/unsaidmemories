// ---------------------------------------------------------------------------
// Supabase Auth email templates (paste into Supabase Dashboard →
// Authentication → Email Templates). Built on the UnSaid Memories design
// system so every system email looks like the brand.
//
// These use GoTrue's handlebar variables — they MUST stay exactly as-is:
//   {{ .ConfirmationURL }}  {{ .Token }}  {{ .Email }}  {{ .NewEmail }}  {{ .NewPhone }}
// Supabase substitutes them when the email is sent.
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, linkFallback, noteBox, otpCode, p, taglineFlourish, frame, esc } from "../design"

const EXPIRY_NOTE = `This link is personal to you and expires soon. If you didn't request it, you can safely ignore this email — nothing changes until you act.`

function authFrame(body: string, preheader: string): string {
  return frame({
    preheader,
    body,
    reason: `You're receiving this email because an UnSaid Memories account action was requested.`,
  })
}

// ---- Auth templates ----------------------------------------------------------

export function confirmSignupHtml(): string {
  return authFrame(
    [
      eyebrow("Welcome to the family"),
      h1(`Confirm your email`),
      tagline(),
      p(`You're one click away from your UnSaid Memories account. Confirming this address unlocks your customer portal — book appointments, manage your pets, and keep your whole grooming history in one place.`),
      button(`{{ .ConfirmationURL }}`, `Confirm my email`),
      linkFallback(`{{ .ConfirmationURL }}`),
      noteBox(`Didn't create an account with UnSaid Memories? Just ignore this email — no account is confirmed until you click.`),
    ].join(""),
    `One click to activate your UnSaid Memories account`
  )
}

function tagline(): string {
  return taglineFlourish()
}

export function inviteUserHtml(): string {
  return authFrame(
    [
      eyebrow("You're invited"),
      h1(`Join the UnSaid Memories portal`),
      p(`The salon team has set up a portal account for you. Accept your invitation below, choose a password, and you're in — your pets, appointments, and grooming records will be waiting for you.`),
      button(`{{ .ConfirmationURL }}`, `Accept & set password`),
      linkFallback(`{{ .ConfirmationURL }}`),
      noteBox(`This invitation is single-use and expires in 24 hours. If it has expired, ask the salon to resend it — takes seconds.`),
    ].join(""),
    `Your UnSaid Memories portal invitation is ready`
  )
}

export function magicLinkHtml(): string {
  return authFrame(
    [
      eyebrow("Your sign-in code"),
      h1(`Here's your one-time code`),
      p(`Enter this code in the UnSaid Memories portal to sign in. It expires in 10 minutes and can only be used once.`),
      otpCode(`{{ .Token }}`, `Only you and UnSaid Memories can see this code — we'll never ask for it by phone.`),
      `<div style="text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.18em;color:#78716c;margin:24px 0 0;">— OR —</div>`,
      button(`{{ .ConfirmationURL }}`, `Sign in with one click`),
      linkFallback(`{{ .ConfirmationURL }}`, `Or paste this sign-in link into your browser:`),
      noteBox(`Didn't try to sign in? Ignore this email — the code expires on its own.`),
    ].join(""),
    `Your UnSaid Memories one-time sign-in code`
  )
}

export function changeEmailHtml(): string {
  return authFrame(
    [
      eyebrow("Verify your new email"),
      h1(`Confirm your new email address`),
      p(`You asked to change the email on your UnSaid Memories account. Confirm below and we'll finish the switch.`),
      detailsCard("Change requested", [
        { label: "New email", value: `{{ .NewEmail }}` },
        { label: "Sent to", value: `{{ .Email }}` },
      ]),
      button(`{{ .ConfirmationURL }}`, `Confirm new email`),
      linkFallback(`{{ .ConfirmationURL }}`),
      noteBox(`Didn't request this change? Reset your password from the sign-in page or call the salon at ${BRAND.phone} so we can secure your account.`, "brick"),
    ].join(""),
    `Confirm your new UnSaid Memories email address`
  )
}

export function resetPasswordHtml(): string {
  return authFrame(
    [
      eyebrow("Password reset"),
      h1(`Let's get you back in`),
      p(`We received a request to reset the password for <strong style="color:#1a1a1a">{{ .Email }}</strong>. Choose a new one below and you'll be signed right back into your portal.`),
      button(`{{ .ConfirmationURL }}`, `Choose a new password`),
      linkFallback(`{{ .ConfirmationURL }}`),
      noteBox(`This reset link expires in 60 minutes. ${EXPIRY_NOTE}`),
    ].join(""),
    `Your UnSaid Memories password reset link`
  )
}

export function reauthenticationHtml(): string {
  return authFrame(
    [
      eyebrow("Quick security check"),
      h1(`Confirm it's really you`),
      p(`You're making a sensitive change to your UnSaid Memories account. Confirm below within the next few minutes to continue — or enter your one-time code where the portal asks for it.`),
      otpCode(`{{ .Token }}`, `Use this code if the portal asks you to verify.`),
      button(`{{ .ConfirmationURL }}`, `Verify it's me`),
      linkFallback(`{{ .ConfirmationURL }}`),
      noteBox(EXPIRY_NOTE),
    ].join(""),
    `Verify it's you — UnSaid Memories security check`
  )
}

// ---- Security notification templates ------------------------------------------

const SECURITY_REASON = `You're receiving this security notification because you have an UnSaid Memories account.`

function securityFrame(body: string, preheader: string): string {
  return frame({ preheader, body, reason: SECURITY_REASON })
}

function securityHead(title: string): string {
  return [eyebrow("Security notice", "brick"), h1(title)].join("")
}

function ifNotYou(): string {
  return [
    noteBox(
      `If this wasn't you: <strong style="color:#1a1a1a">reset your password immediately</strong>, then call the salon at <strong style="color:#1a1a1a">${BRAND.phone}</strong> so we can lock things down.`,
      "brick"
    ),
    // Every "act now" instruction gets a button that routes somewhere real
    // — the sign-in door with the Forgot Password? link.
    button(`${BRAND.portalUrl}`, `Reset my password now`, { tone: "brick", align: "left" }),
  ].join("")
}

export function passwordChangedHtml(): string {
  return securityFrame(
    [
      securityHead(`Your password was changed`),
      p(`Your UnSaid Memories account password was just updated. You're all signed in and set — this is just a heads-up for your records.`),
      detailsCard("What changed", [
        { label: "Changed", value: "Account password" },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `Your UnSaid Memories password was changed`
  )
}

export function emailAddressChangedHtml(): string {
  return securityFrame(
    [
      securityHead(`Your email address was changed`),
      p(`The sign-in email on your UnSaid Memories account was changed. Going forward, use the new address below to sign in — this notice went to both addresses for your security.`),
      detailsCard("What changed", [
        { label: "New sign-in email", value: `{{ .NewEmail }}` },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `Your UnSaid Memories email address was changed`
  )
}

export function phoneNumberChangedHtml(): string {
  return securityFrame(
    [
      securityHead(`Your phone number was changed`),
      p(`The phone number on your UnSaid Memories account was updated.`),
      detailsCard("What changed", [
        { label: "New phone number", value: `{{ .NewPhone }}` },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `Your UnSaid Memories phone number was changed`
  )
}

export function signInMethodLinkedHtml(): string {
  return securityFrame(
    [
      securityHead(`A sign-in method was linked`),
      p(`A new sign-in method (such as Google or Apple sign-in) was linked to your UnSaid Memories account. You can now use it to sign in alongside your email and password.`),
      detailsCard("What changed", [
        { label: "Change", value: "New sign-in method linked" },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `A sign-in method was linked to your account`
  )
}

export function signInMethodRemovedHtml(): string {
  return securityFrame(
    [
      securityHead(`A sign-in method was removed`),
      p(`A sign-in method (such as Google or Apple sign-in) was removed from your UnSaid Memories account. Your email and password continue to work as always.`),
      detailsCard("What changed", [
        { label: "Change", value: "Sign-in method removed" },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `A sign-in method was removed from your account`
  )
}

export function mfaAddedHtml(): string {
  return securityFrame(
    [
      securityHead(`Two-factor authentication added`),
      p(`Multi-factor authentication (MFA) was added to your UnSaid Memories account. From now on, signing in asks for your password plus a second step — a little extra work for a lot more safety.`),
      detailsCard("What changed", [
        { label: "Change", value: "MFA enabled" },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "sage" }),
      noteBox(`If this wasn't you, reset your password right away and call the salon at <strong style="color:#1a1a1a">${BRAND.phone}</strong> — we'll help secure the account.`, "brick"),
      button(`${BRAND.portalUrl}`, `Reset my password now`, { tone: "brick", align: "left" }),
    ].join(""),
    `Two-factor authentication was added to your account`
  )
}

export function mfaRemovedHtml(): string {
  return securityFrame(
    [
      securityHead(`Two-factor authentication removed`),
      p(`Multi-factor authentication (MFA) was removed from your UnSaid Memories account. Signing in now only asks for your password.`),
      detailsCard("What changed", [
        { label: "Change", value: "MFA removed" },
        { label: "Action needed", value: "None — informational" },
      ], { tone: "brick" }),
      ifNotYou(),
    ].join(""),
    `Two-factor authentication was removed from your account`
  )
}
