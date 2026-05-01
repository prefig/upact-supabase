import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AuthError,
	IdentityPort,
	Session,
	Upactor,
} from '@prefig/upact';
import { createSession } from '@prefig/upact';
import { userToUpactor } from './identity-mapper.js';

/**
 * Credential shape this adapter accepts. Tagged union — discriminated by
 * `kind`. Anything that is not one of these shapes is rejected by
 * `authenticate` with `AuthError({ code: 'credential_invalid' })`
 * before any substrate call is made.
 */
export type SupabaseCredential =
	| { kind: 'password'; email: string; password: string }
	| { kind: 'otp'; email: string };

/**
 * Adapter that conforms a Supabase Auth substrate to the upact
 * `IdentityPort`. Per-request: the factory accepts a request-bound
 * `SupabaseClient` (cookies bound at construction, e.g. SvelteKit
 * `event.locals.supabase`). Module-singleton instantiation is incorrect
 * because the SupabaseClient itself binds the request's cookies.
 *
 * The returned `IdentityPort` holds the `SupabaseClient` in closure
 * scope. It is unreachable via reflection on the returned object —
 * `(adapter as any).supabase` is `undefined`, `Object.keys(adapter)`
 * does not surface it, `JSON.stringify(adapter)` does not include
 * substrate state. Decision 11 / SPEC.md §7.5 conformance verified
 * against sixteen reflection vectors in `tests/back-channel.test.ts`.
 *
 * Factory-only. There is no class form: the audit (CONTRIBUTING.md)
 * found no concrete forward-looking use case that the factory does
 * not satisfy, and the binding is most genuine when there is exactly
 * one shape consumers can reach for.
 *
 * The `request: Request` parameter on `currentUpactor` is unused —
 * cookies are already bound to the `SupabaseClient`.
 */
export function createSupabaseAdapter(supabase: SupabaseClient): IdentityPort {
	return {
		async authenticate(credential: unknown): Promise<Session | AuthError> {
			if (!isSupabaseCredential(credential)) {
				return {
					code: 'credential_invalid',
					message: 'unrecognised credential shape',
				};
			}
			if (credential.kind === 'password') {
				const { data, error } = await supabase.auth.signInWithPassword({
					email: credential.email,
					password: credential.password,
				});
				if (error) return normaliseAuthError(error);
				return createSession(data.session);
			}
			const { data, error } = await supabase.auth.signInWithOtp({
				email: credential.email,
			});
			if (error) return normaliseAuthError(error);
			return createSession(data.session);
		},

		async currentUpactor(_request: Request): Promise<Upactor | null> {
			const { data } = await supabase.auth.getUser();
			return data.user ? userToUpactor(data.user) : null;
		},

		async invalidate(_session: Session): Promise<void> {
			await supabase.auth.signOut();
		},

		/**
		 * Substrate-specific behaviour: both `identity` and `evidence` are
		 * unused. Supabase's `refreshSession()` acts on the cookie-bound
		 * client, so the operation refreshes whichever identity owns the
		 * request cookies. Applications SHOULD only call this in an explicit
		 * renewal context (sliding-window middleware, scheduled refresh) —
		 * not on every request. See README conformance statement.
		 */
		async issueRenewal(
			_identity: Upactor,
			_evidence: unknown,
		): Promise<Upactor | null> {
			const { error } = await supabase.auth.refreshSession();
			if (error) return null;
			const { data } = await supabase.auth.getUser();
			return data.user ? userToUpactor(data.user) : null;
		},
	};
}

function isSupabaseCredential(value: unknown): value is SupabaseCredential {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as { kind?: unknown; email?: unknown; password?: unknown };
	if (typeof candidate.email !== 'string' || candidate.email.length === 0) return false;
	if (candidate.kind === 'password') {
		return typeof candidate.password === 'string' && candidate.password.length > 0;
	}
	return candidate.kind === 'otp';
}

/**
 * Map Supabase auth errors to upact's port-level AuthError vocabulary
 * (normative per SPEC.md §6.5 / Decision 4).
 *
 * Codes describe failure category at the port layer, not substrate
 * semantics — substrate detail goes in `message`.
 *
 * Codes this adapter emits:
 *   - credential_invalid:    elsewhere — malformed credential rejected pre-substrate
 *   - credential_rejected:   substrate rejected the credential (wrong password, no such user)
 *   - rate_limited:          substrate rate-limited the operation
 *   - substrate_unavailable: substrate is unreachable / network error
 *   - auth_failed:           catch-all for unexpected substrate failure
 *
 * The unified vocabulary also includes `identity_unavailable`, which
 * Supabase does not distinguish from `credential_rejected` (Supabase
 * conflates "no such user" with "wrong password" as
 * credential-stuffing-resistance). Other adapters may emit it.
 */
function normaliseAuthError(err: { message?: string }): AuthError {
	const raw = typeof err.message === 'string' ? err.message.toLowerCase() : '';
	if (raw.includes('rate') || raw.includes('too many')) {
		return { code: 'rate_limited', message: 'authentication rate-limited' };
	}
	if (raw.includes('invalid') || raw.includes('credentials') || raw.includes('not found')) {
		return { code: 'credential_rejected', message: 'substrate rejected the credential' };
	}
	if (raw.includes('network') || raw.includes('fetch')) {
		return { code: 'substrate_unavailable', message: 'substrate unavailable during authentication' };
	}
	return { code: 'auth_failed', message: 'authentication failed' };
}
