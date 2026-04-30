# @prefig/upact-supabase

> Supabase Auth adapter for [upact](https://github.com/prefig/upact) — wraps Supabase's identity substrate behind the upact identity port, with privacy minima enforced at the adapter boundary.

**Status:** v0.1-draft. Implementation lifting from [`dyad.berlin`](https://dyad.berlin)'s `refactor/identity-service` branch in progress.

## What this is

Most apps that use Supabase for authentication end up with `auth.users.email`, `session.jwt.sub`, and substrate-shaped types leaking into their domain code. This package provides an **anti-corruption layer**: a `SupabaseUpactAdapter` that implements [upact's `IdentityPort`](https://github.com/prefig/upact/blob/main/SPEC.md), wraps Supabase's `User` shape, and exposes only what upact permits.

The adapter:

- Returns `UserIdentity` with `id`, optional `display_hint`, `lifecycle: { issued_at, renewable: 'reauth' }`, and `capabilities: ReadonlySet<Capability>`
- **Strips PII per upact §7** — no email, phone, IP, `app_metadata`, `user_metadata` beyond a display hint, JWT claims, `confirmed_at`, etc.
- Exposes `email` and `recovery` capabilities (based on Supabase's substrate) so apps can branch on capability presence
- Provides a separate `EmailChannel` export for capability-bound email delivery — never on the identity object

## Usage (target shape — implementation pending)

```ts
import { SupabaseUpactAdapter } from '@prefig/upact-supabase';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(URL, ANON_KEY);
const port = new SupabaseUpactAdapter(supabase);

const identity = await port.currentIdentity(request);
if (identity?.capabilities.has('email')) {
    // route through EmailChannel — never reach into the substrate
}
```

## License

Apache-2.0. Adapters are permissively licensed so proprietary and copyleft applications alike can adopt them.

## Status

Scaffolded 2026-04-30. Implementation pending. Open in this order:

1. **`~/prefig/upact/SPEC.md`** — the contract this adapter conforms to (especially §4 UserIdentity shape, §6 operations, §7 privacy minima).
2. **`~/prefig/rebuild/docs/plans/2026-04-30-001-feat-upact-supabase-adapter-plan.md`** — adapter implementation plan stub. Full plan to be written in a fresh `/ce:plan` session; resolve the linking-strategy question first (npm link vs github: vs file:).
3. **`~/dyad.berlin/src/lib/services/identity.ts`** on branch `refactor/identity-service` — the existing logic to lift; the bulk of the v0.1 work is refactoring this code into the adapter shape.
4. **`~/prefig/rebuild/docs/2026-04-30-identity-port-pattern.md`** — the synthesis explaining the architectural reframe (private context).
