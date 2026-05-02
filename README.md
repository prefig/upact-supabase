# @prefig/upact-supabase

A Supabase Auth adapter for the [upact](https://github.com/prefig/upact) identity port. Wraps Supabase's `User` shape behind upact's `Upactor` contract, with privacy minima enforced at the adapter boundary.

## Install

```sh
# Pin to specific commit SHAs (recommended)
npm install github:prefig/upact-supabase#<sha> github:prefig/upact#<sha>
```

Tags are mutable; SHAs are content-addressed. Pin to SHAs for supply-chain integrity. The `@prefig/upact` peer dependency is auto-installed with npm 7+.

## Usage

```ts
import { createSupabaseAdapter } from '@prefig/upact-supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(URL, ANON_KEY); // request-bound for SSR
const port = createSupabaseAdapter(supabase);

const upactor = await port.currentUpactor(request);
if (upactor?.capabilities.has('email')) {
	// gate email-bound features
}
```

The adapter is per-request — instantiate it inside request handlers from a request-bound `SupabaseClient` (e.g. SvelteKit's `event.locals.supabase`), not as a module singleton. The `userToUpactor` and `capabilitiesFromUser` helpers are also exported as a sync convenience for consumers whose substrate populates a User synchronously and want to keep their own identity-derivation paths sync.

## Conformance statement

Per upact §10:

| Item | Value |
|---|---|
| Spec version | upact v0.1 |
| Substrate | Supabase Auth (`@supabase/supabase-js` ^2.0.0) |
| Self-declared capabilities | `email`, `recovery` when `user.email` is present; empty otherwise |
| Capability coupling | Supabase's recovery is email-based; this adapter binds `recovery` to `email` (both present together or both absent). Not a generalisable pattern — see [`upact/docs/adapter-shapes.md`](https://github.com/prefig/upact/blob/main/docs/adapter-shapes.md). |
| Threat model | Low-to-medium-stakes coordination. The Supabase substrate is centrally hosted; its threat model is acceptable in exchange for simplicity. Higher-stakes deployments should select an adapter against a substrate appropriate to their threat model. |
| Channel-bound operations | Deferred to v0.2 per upact §5.3 (channel operations are explicitly outside the spec's scope). v0.1 declares the `email` and `recovery` capabilities; channel implementations follow when a real consumer drives the design. |
| `issueRenewal` substrate behaviour | Both `identity` and `evidence` parameters are unused on this adapter. Supabase's `refreshSession()` acts on the cookie-bound client; the operation refreshes whichever identity owns the request cookies. Applications SHOULD only call `issueRenewal` in an explicit renewal context (sliding-window middleware, scheduled refresh) — not on every request. |
| `display_hint` provenance | Sourced from `user_metadata.display_name` (application-writable in Supabase). The adapter trims whitespace and rejects email-shaped strings (per upact §4.2 MUST NOT — display hints must not be email addresses). It does not perform deeper sanitisation: applications that care about impersonation prevention should override `display_hint` with their own logic (petnames, vetted display names, …). |
| `Session` opacity | Sessions created via `createSession` from `@prefig/upact`. Opacity is centralised in the upact runtime kernel and verified by sixteen-vector reflection test at `tests/back-channel.test.ts`. |
| `AuthError` vocabulary | Port-level codes, unified with `@prefig/upact-simplex`: `credential_invalid`, `credential_rejected`, `substrate_unavailable`, `identity_unavailable`, `rate_limited`, `auth_failed`. Codes describe failure category at the port layer, not Supabase semantics. Substrate detail goes in `message`; raw substrate error text is not propagated verbatim to callers. |
| SHOULD-clause deviations | None for v0.1. |

## Status

v0.1.0. Breaking changes between v0.x revisions are permitted; v1.0 marks the first stable version.

## Licence

Apache-2.0.
