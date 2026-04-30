import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthError } from '@prefig/upact';
import { SupabaseUpactAdapter } from '../src/adapter.js';
import { makeUser } from './fixtures/user.js';

interface MockAuth {
	getUser: ReturnType<typeof vi.fn>;
	signInWithPassword: ReturnType<typeof vi.fn>;
	signInWithOtp: ReturnType<typeof vi.fn>;
	signOut: ReturnType<typeof vi.fn>;
	refreshSession: ReturnType<typeof vi.fn>;
}

function makeSupabase(authOverrides: Partial<MockAuth> = {}): {
	supabase: SupabaseClient;
	auth: MockAuth;
} {
	const auth: MockAuth = {
		getUser: vi.fn().mockResolvedValue({ data: { user: makeUser() } }),
		signInWithPassword: vi
			.fn()
			.mockResolvedValue({
				data: { session: { access_token: 'jwt-token', user: makeUser() } },
				error: null,
			}),
		signInWithOtp: vi
			.fn()
			.mockResolvedValue({ data: { session: null, user: null }, error: null }),
		signOut: vi.fn().mockResolvedValue({ error: null }),
		refreshSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
		...authOverrides,
	};
	const supabase = { auth } as unknown as SupabaseClient;
	return { supabase, auth };
}

const fakeRequest = new Request('http://localhost/');

function isAuthError(value: unknown): value is AuthError {
	return (
		typeof value === 'object' &&
		value !== null &&
		'code' in value &&
		'message' in value &&
		typeof (value as { code: unknown }).code === 'string'
	);
}

describe('SupabaseUpactAdapter — currentIdentity', () => {
	it('returns a UserIdentity matching the mapper output for an authenticated user', async () => {
		const { supabase } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const identity = await adapter.currentIdentity(fakeRequest);
		expect(identity).not.toBeNull();
		expect(identity?.id).toBe('user-1');
		expect(identity?.capabilities.has('email')).toBe(true);
	});

	it('returns null when no user is authenticated', async () => {
		const { supabase } = makeSupabase({
			getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
		});
		const adapter = new SupabaseUpactAdapter(supabase);
		const identity = await adapter.currentIdentity(fakeRequest);
		expect(identity).toBeNull();
	});

	it('strips substrate fields from the returned UserIdentity (JSON.stringify check)', async () => {
		const { supabase } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const identity = await adapter.currentIdentity(fakeRequest);
		const json = JSON.stringify(identity);
		expect(json).not.toContain('a@example.com');
		expect(json).not.toContain('app_metadata');
		expect(json).not.toContain('admin');
	});

	it('preserves the PII boundary across multiple calls with different mock users', async () => {
		const userA = makeUser({ id: 'a', email: 'one@example.com' });
		const userB = makeUser({
			id: 'b',
			email: 'two@example.com',
			user_metadata: { display_name: 'Bob' },
		});
		const getUser = vi
			.fn()
			.mockResolvedValueOnce({ data: { user: userA } })
			.mockResolvedValueOnce({ data: { user: userB } });
		const { supabase } = makeSupabase({ getUser });
		const adapter = new SupabaseUpactAdapter(supabase);

		const idA = await adapter.currentIdentity(fakeRequest);
		const idB = await adapter.currentIdentity(fakeRequest);

		for (const id of [idA, idB]) {
			const json = JSON.stringify(id);
			expect(json).not.toContain('@example.com');
			expect(json).not.toContain('app_metadata');
		}
		expect(idA?.id).toBe('a');
		expect(idB?.id).toBe('b');
	});
});

describe('SupabaseUpactAdapter — authenticate', () => {
	it('dispatches password credentials to signInWithPassword', async () => {
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const result = await adapter.authenticate({
			kind: 'password',
			email: 'a@example.com',
			password: 'hunter2',
		});
		expect(auth.signInWithPassword).toHaveBeenCalledOnce();
		expect(auth.signInWithPassword).toHaveBeenCalledWith({
			email: 'a@example.com',
			password: 'hunter2',
		});
		expect(auth.signInWithOtp).not.toHaveBeenCalled();
		expect(isAuthError(result)).toBe(false);
	});

	it('dispatches otp credentials to signInWithOtp', async () => {
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const result = await adapter.authenticate({
			kind: 'otp',
			email: 'a@example.com',
		});
		expect(auth.signInWithOtp).toHaveBeenCalledOnce();
		expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'a@example.com' });
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(isAuthError(result)).toBe(false);
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['a string', 'hunter2'],
		['empty object', {}],
		['object missing kind', { email: 'a@example.com', password: 'hunter2' }],
		['unknown kind', { kind: 'wat', email: 'a@example.com' }],
		['empty email', { kind: 'password', email: '', password: 'hunter2' }],
		['password missing', { kind: 'password', email: 'a@example.com' }],
	])('rejects malformed credential (%s) without calling the substrate', async (_, credential) => {
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const result = await adapter.authenticate(credential);
		expect(isAuthError(result)).toBe(true);
		expect((result as AuthError).code).toBe('invalid_credential');
		expect(auth.signInWithPassword).not.toHaveBeenCalled();
		expect(auth.signInWithOtp).not.toHaveBeenCalled();
	});

	it.each([
		['Invalid login credentials', 'invalid_grant'],
		['User not found', 'invalid_grant'],
		['Email rate limit exceeded', 'rate_limited'],
		['Too many requests', 'rate_limited'],
		['fetch failed: network', 'network'],
		['Database is on fire', 'auth_failed'],
	])('normalises substrate error "%s" to code "%s"', async (substrateMessage, expectedCode) => {
		const { supabase } = makeSupabase({
			signInWithPassword: vi
				.fn()
				.mockResolvedValue({ data: null, error: { message: substrateMessage } }),
		});
		const adapter = new SupabaseUpactAdapter(supabase);
		const result = await adapter.authenticate({
			kind: 'password',
			email: 'a@example.com',
			password: 'hunter2',
		});
		expect(isAuthError(result)).toBe(true);
		expect((result as AuthError).code).toBe(expectedCode);
		expect((result as AuthError).message).not.toBe(substrateMessage);
	});

	it('does not leak the substrate JWT through the returned Session value', async () => {
		const { supabase } = makeSupabase({
			signInWithPassword: vi.fn().mockResolvedValue({
				data: {
					session: {
						access_token: 'eyJleampleJWTbody.signature',
						refresh_token: 'refreshtoken-1234',
						user: makeUser(),
					},
				},
				error: null,
			}),
		});
		const adapter = new SupabaseUpactAdapter(supabase);
		const result = await adapter.authenticate({
			kind: 'password',
			email: 'a@example.com',
			password: 'hunter2',
		});
		expect(isAuthError(result)).toBe(false);
		const json = JSON.stringify(result);
		expect(json).not.toContain('eyJleampleJWTbody');
		expect(json).not.toContain('refreshtoken-1234');
		expect(json).not.toContain('access_token');
		expect(json).not.toContain('a@example.com');
		expect(json).toBe('"[upact:session]"');
	});
});

describe('SupabaseUpactAdapter — invalidate', () => {
	it('calls signOut and resolves to void', async () => {
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const session = (await adapter.authenticate({
			kind: 'password',
			email: 'a@example.com',
			password: 'hunter2',
		})) as never;
		const result = await adapter.invalidate(session);
		expect(result).toBeUndefined();
		expect(auth.signOut).toHaveBeenCalledOnce();
	});
});

describe('SupabaseUpactAdapter — issueRenewal', () => {
	it('refreshes the session and returns a fresh UserIdentity on success', async () => {
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const stale = await adapter.currentIdentity(fakeRequest);
		const renewed = await adapter.issueRenewal(stale!, undefined);
		expect(auth.refreshSession).toHaveBeenCalledOnce();
		expect(renewed).not.toBeNull();
		expect(renewed?.id).toBe('user-1');
	});

	it('returns null when refreshSession fails', async () => {
		const { supabase } = makeSupabase({
			refreshSession: vi.fn().mockResolvedValue({ error: { message: 'expired' } }),
		});
		const adapter = new SupabaseUpactAdapter(supabase);
		const stale = await adapter.currentIdentity(fakeRequest);
		const renewed = await adapter.issueRenewal(stale!, undefined);
		expect(renewed).toBeNull();
	});

	it('ignores the identity argument — refreshes whoever owns the cookies', async () => {
		// Renewal is requested with an arbitrary identity that is NOT the current
		// cookie holder. The adapter still calls refreshSession and returns the
		// cookie holder's identity (substrate-specific behaviour, documented).
		const { supabase, auth } = makeSupabase();
		const adapter = new SupabaseUpactAdapter(supabase);
		const arbitrary = {
			id: 'someone-else',
			lifecycle: { issued_at: '2020-01-01T00:00:00Z', renewable: 'reauth' as const },
			capabilities: new Set<string>(),
		};
		const renewed = await adapter.issueRenewal(arbitrary, { evidence: 'ignored' });
		expect(auth.refreshSession).toHaveBeenCalledOnce();
		expect(renewed?.id).toBe('user-1'); // cookie holder, not the passed identity
	});
});
