# Conformance: @prefig/upact-supabase

**Spec version:** upact v0.1
**Package version:** 0.1.0
**Date:** 2026-05-01

## Substrate

Supabase Auth — a managed PostgreSQL-backed identity service. `auth.users` is the substrate user record. Enforcement-camp substrate: the Supabase `User` object exposes email, phone, JWT claims, `app_metadata`, and `user_metadata`; the adapter strips all of these except what is needed to populate the three `Upactor` fields.

## Threat model

Casual coordination. Supabase Auth is a centralised service operated by Supabase, Inc. It is not appropriate for adversarial-context deployments where substrate-operator trust is not granted. The adapter is designed for applications where the substrate's leakiness is acceptable in exchange for Supabase's ergonomics and reliability.

## Capabilities self-declared

`['email', 'recovery']` — for users with a confirmed email address (non-empty `user.email`).
`[]` — for users without a confirmed email address.

Concrete consumer: dyad M1 UI gates on `capabilities.has('email')` to show or hide email-related settings. `recovery` is bundled with `email` because the same email address that identifies the user is the recovery channel; they are not independently affords.

## AuthError mapping table

| Substrate error | AuthErrorCode |
|---|---|
| `AuthApiError` (invalid credentials, wrong password) | `credential_rejected` |
| `AuthApiError` (user not found) | `credential_rejected` |
| `AuthApiError` (email not confirmed) | `credential_rejected` |
| `AuthApiError` (rate limit) | `rate_limited` |
| Network error / Supabase unreachable | `substrate_unavailable` |
| Malformed substrate User (no `id` field) | `auth_failed` |
| Unknown error | `auth_failed` |

Note: Supabase conflates "user not found" with "wrong password" as credential-stuffing resistance. Both surface as `credential_rejected`. `identity_unavailable` is not emitted by this adapter.

## Session opacity

This adapter uses `createSession` from `@prefig/upact` for Session construction.

## Adapter back-channel closure

This adapter passes a sixteen-vector reflection test at `tests/back-channel.test.ts`. Sentinel values for `__internalToken`, `__anonKey`, and `__url` on a mock `SupabaseClient` are verified unreachable through JSON.stringify, Object.keys, Object.getOwnPropertyNames, Reflect.ownKeys, Object.getOwnPropertySymbols, for-in, structuredClone, util.inspect, direct property access by name, Object spread, wrapped JSON.stringify, and cast access to `client`, `supabase`, `_client`.

## Deviations from SHOULD clauses

None.

## Identifier derivation

`Upactor.id` is set directly from `user.id` — the Supabase Auth UUID. Supabase UUIDs are opaque random identifiers (`gen_random_uuid()`); they are not derivable from user-supplied identifiers (email, phone). No hashing is applied. The raw UUID is not email-shaped and carries no information about the user visible at the application layer.
