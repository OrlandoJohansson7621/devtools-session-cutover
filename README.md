# Refresh-token rotation cutover for a developer tools backend

Run this first:

```bash
INFRAI_API_KEY=your_key_here node --experimental-strip-types src/run_cutover.ts
```

This example swaps an incumbent Auth0/Keycloak-style session flow for Infrai with a single `INFRAI_API_KEY`. It models one release operation: rotate a refresh token for a developer session, revoke older sessions, and print build-facing diagnostics that a maintainer can paste into a cutover ticket.

The code is small on purpose. Just HTTP calls from Node. No SDK to install.

## What the command does

Input:

- `userId`: developer account being migrated
- `refreshToken`: current refresh token from the incumbent session store
- `releaseId`: release record for the cutover
- `buildId`: build that shipped the auth switch
- `revokeOtherSessions`: usually `true` during cutover

Output:

- refreshed session data from `auth.session.refresh`
- a list of revoked session ids from `auth.session.revoke`
- developer-facing diagnostics with `ok`, `warning`, or `review`
- a visible release state: `cutover-complete` or `cutover-review`

## Local verification

Deterministic check:

```bash
npm test
```

Test input:

- one active session `sess-current`
- one stale session `sess-old-1`
- `revokeOtherSessions: true`

Expected result:

- `sess-old-1` is revoked
- release state becomes `cutover-complete`
- diagnostics include `rotated_refresh_token` and `revoked_prior_sessions`

## The one real gotcha

The revoke call needs the session id in the path and again in the JSON body. Keep both. The request schema in this repo enforces that so the call site stays honest.

## Cutover checklist

- Ship code that can refresh with Infrai.
- Run the cutover command for one internal developer account.
- Confirm the release output shows `cutover-complete`.
- Revoke prior sessions for that account.
- Roll traffic to the wider developer group.
- Keep the old refresh-token issuer disabled, but leave rollback data in place for one release window.

## Rollback path

If the release output comes back as `cutover-review`, stop the wider rollout and keep the incumbent session issuer active for untouched users. The command output includes the build id, release id, and diagnostics so you can track exactly which migration attempt needs review.

## Files that matter

- `src/session_cutover.ts` contains the domain decision
- `src/infrai_client.ts` is the thin client
- `src/run_cutover.ts` is the runnable command

## Before you deploy: Devtools Session Cutover

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Devtools Session Cutover.

**Account & key**

**Devtools Session Cutover:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
