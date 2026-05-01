import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AuthError,
	IdentityPort,
	Session,
	UserIdentity,
} from '@prefig/upact';
import { userToIdentity } from './identity-mapper.js';

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
 * The upact `Session` is brand-typed at compile time. To preserve opacity
 * at runtime as well, the adapter wraps the substrate session inside this
 * class with no enumerable substrate-shaped properties and a `toJSON()`
 * that returns an opaque token. Per upact §7.4 — applications must not
 * decompose, decode, or extract claims from a Session.
 */
class OpaqueSubstrateSession {
	#held: unknown;
	constructor(held: unknown) {
		this.#held = held;
	}
	/** Adapter-internal accessor; not part of the port surface. */
	_unwrap(): unknown {
		return this.#held;
	}
	toJSON(): string {
		return '[upact:session]';
	}
}

/**
 * Adapter that conforms a Supabase Auth substrate to the upact
 * `IdentityPort`. Per-request: the constructor accepts a request-bound
 * `SupabaseClient` (cookies bound at construction, e.g. SvelteKit
 * `event.locals.supabase`). Module-singleton instantiation is incorrect
 * because the SupabaseClient itself binds the request's cookies.
 *
 * The `request: Request` parameter on `currentIdentity` is unused on
 * this adapter — cookies are already bound to the SupabaseClient.
 */
export class SupabaseUpactAdapter implements IdentityPort {
	constructor(private readonly supabase: SupabaseClient) {}

	async authenticate(
		credential: unknown,
	): Promise<Session | AuthError> {
		if (!isSupabaseCredential(credential)) {
			return { code: 'credential_invalid', message: 'unrecognised credential shape' };
		}
		if (credential.kind === 'password') {
			const { data, error } = await this.supabase.auth.signInWithPassword({
				email: credential.email,
				password: credential.password,
			});
			if (error) return normaliseAuthError(error);
			return wrapSession(data.session);
		}
		const { data, error } = await this.supabase.auth.signInWithOtp({
			email: credential.email,
		});
		if (error) return normaliseAuthError(error);
		return wrapSession(data.session);
	}

	async currentIdentity(_request: Request): Promise<UserIdentity | null> {
		const { data } = await this.supabase.auth.getUser();
		return data.user ? userToIdentity(data.user) : null;
	}

	async invalidate(_session: Session): Promise<void> {
		await this.supabase.auth.signOut();
	}

	/**
	 * Substrate-specific behaviour: both `identity` and `evidence` are
	 * unused. Supabase's `refreshSession()` acts on the cookie-bound
	 * client, so the operation refreshes whichever identity owns the
	 * request cookies. Applications SHOULD only call this in an explicit
	 * renewal context (sliding-window middleware, scheduled refresh) —
	 * not on every request. See README conformance statement.
	 */
	async issueRenewal(
		_identity: UserIdentity,
		_evidence: unknown,
	): Promise<UserIdentity | null> {
		const { error } = await this.supabase.auth.refreshSession();
		if (error) return null;
		const { data } = await this.supabase.auth.getUser();
		return data.user ? userToIdentity(data.user) : null;
	}
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

function wrapSession(held: unknown): Session {
	return new OpaqueSubstrateSession(held) as unknown as Session;
}

/**
 * Map Supabase auth errors to upact's port-level AuthError vocabulary.
 *
 * The vocabulary is unified across @prefig/upact-supabase and
 * @prefig/upact-simplex (see the SimpleX adapter and adapter-shapes.md
 * for the full set). Codes describe failure category at the port layer,
 * not substrate semantics — substrate detail goes in `message`.
 *
 * Codes used here:
 *   - rate_limited:        substrate rate-limited the operation
 *   - credential_rejected: credential reached the substrate but was rejected
 *   - substrate_unavailable: substrate is unreachable or returned a transport error
 *   - auth_failed:         catch-all for unexpected substrate failure
 *
 * Other unified codes (`credential_invalid` for malformed input,
 * `identity_unavailable` for missing identity records) are emitted
 * elsewhere in this adapter where appropriate.
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
