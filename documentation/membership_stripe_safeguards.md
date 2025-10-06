# Membership + Stripe Safeguards

This note summarizes the guardrails added on 2025-10-05 before wiring Stripe checkout to memberships.

## Backend

- Added `GET /membership/session` to return sanitized membership state (status, limits, dealer context).
- Every fetch is logged (`logger.info`) with membership id, status, paid flag and usage counters.
- Response includes `checkout_available` flag so the frontend only shows the Stripe button when keys are configured.

## Frontend

- Dealer dashboard (`/dealers`) now hides superadmin-specific controls when a membership session is detected and rehydrates dealer context and allowed brands by calling the new endpoint.
- Membership signup flow re-syncs session data after verifying codes, saving profile data, and on reload, keeping limits/brand info aligned with the backend even if localStorage is cleared mid-session.

## Operational Checklist

- Before enabling Stripe in production, double-check that `self_memberships` and `self_membership_sessions` tables are backed up (pg_dump or Supabase backup) and that the new endpoint works with real tokens.
- Stripe configuration requires `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_SUCCESS_URL`. Without those the checkout button is disabled via `checkout_available`.
- Monitor logs for `[membership] session info accessed` to audit usage and detect abnormal token reuse.

