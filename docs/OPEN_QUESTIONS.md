# Open questions

Needs an owner/founder decision; safe defaults are in place for each.

1. **$5 verification: what is it really?** One-time fee, refundable deposit,
   or paired with real ID verification? Current default: demo bypass only,
   provider-neutral `verification_status` field ready for either.
2. **Identity verification vendor** (Persona/Stripe Identity/Veriff…).
   Constraint already enforced: no government-ID media may be stored in
   Swoon's database — provider references only.
3. **Domain**: `tryswoon.live` (purchased, per team chat) vs `tryswoon.com`
   (in the PDF). App is `APP_URL`-driven; emails in copy use tryswoon.live.
4. **Matching preferences**: gender/orientation/age-range/distance filters
   are deliberately absent. FIFO + block exclusion only. Product needs to
   define the fairness rules before growth.
5. **TURN relay**: accept ~10–15% connect failures pre-alpha, or pay for a
   TURN service (Twilio NTS, Cloudflare Calls, coturn) before real users?
   Config accepts TURN URLs already (`NEXT_PUBLIC_ICE_SERVERS`).
6. **Moderation staffing**: who reviews reports and underage quarantines,
   with what SLA? Dashboard exists; runbook and duty roster don't.
7. **Email confirmation + password reset** timing (required before closed
   alpha; needs SMTP/Resend decision).
8. **Legal review** of terms/privacy/guidelines drafts, recording-consent
   posture, and age-assurance obligations by jurisdiction.
