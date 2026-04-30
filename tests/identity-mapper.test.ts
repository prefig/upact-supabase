import { describe, it, expect } from 'vitest';
import { userToIdentity } from '../src/identity-mapper.js';
import { makeUser } from './fixtures/user.js';

describe('userToIdentity', () => {
	it('builds the upact UserIdentity from a Supabase user', () => {
		const identity = userToIdentity(makeUser());
		expect(identity.id).toBe('user-1');
		expect(identity.display_hint).toBe('Alice');
		expect(identity.lifecycle).toEqual({
			issued_at: '2026-01-01T00:00:00Z',
			renewable: 'reauth',
		});
		expect(identity.capabilities.has('email')).toBe(true);
		expect(identity.capabilities.has('recovery')).toBe(true);
	});

	it('omits display_hint when user_metadata.display_name is absent', () => {
		const identity = userToIdentity(makeUser({ user_metadata: {} }));
		expect(identity).not.toHaveProperty('display_hint');
	});

	it('omits display_hint when display_name is empty after trim', () => {
		const identity = userToIdentity(makeUser({ user_metadata: { display_name: '   ' } }));
		expect(identity).not.toHaveProperty('display_hint');
	});

	it('omits display_hint when display_name is not a string', () => {
		const identity = userToIdentity(makeUser({ user_metadata: { display_name: 123 } }));
		expect(identity).not.toHaveProperty('display_hint');
	});

	it('returns an empty capability set when user has no email', () => {
		const identity = userToIdentity(makeUser({ email: undefined }));
		expect(identity.capabilities.size).toBe(0);
	});

	it('does not derive display_hint from email under any circumstance', () => {
		const identity = userToIdentity(
			makeUser({ email: 'fallback@example.com', user_metadata: {} }),
		);
		expect(identity).not.toHaveProperty('display_hint');
	});

	it('lifecycle has only issued_at and renewable for the reauth substrate', () => {
		const identity = userToIdentity(makeUser());
		expect(Object.keys(identity.lifecycle).sort()).toEqual(['issued_at', 'renewable']);
		expect(identity.lifecycle).not.toHaveProperty('expires_at');
	});

	it('exposes only the four port-defined fields (Object.keys)', () => {
		const identity = userToIdentity(makeUser());
		expect(Object.keys(identity).sort()).toEqual([
			'capabilities',
			'display_hint',
			'id',
			'lifecycle',
		]);
	});

	it('exposes only the three port-defined fields when display_hint is absent', () => {
		const identity = userToIdentity(makeUser({ user_metadata: {} }));
		expect(Object.keys(identity).sort()).toEqual(['capabilities', 'id', 'lifecycle']);
	});

	it('serialises with no substrate fields (JSON.stringify privacy assertion)', () => {
		const identity = userToIdentity(makeUser());
		const json = JSON.stringify(identity);
		// PII the mock User carries that MUST NOT leak through:
		expect(json).not.toContain('a@example.com'); // email
		expect(json).not.toContain('authenticated'); // aud, role
		expect(json).not.toContain('admin'); // app_metadata.role
		expect(json).not.toContain('email_confirmed_at');
		expect(json).not.toContain('last_sign_in_at');
		expect(json).not.toContain('app_metadata');
		expect(json).not.toContain('user_metadata');
		expect(json).not.toContain('identities');
		expect(json).not.toContain('updated_at');
	});

	it('does not leak fields even when callers reach for them via Object access', () => {
		const identity = userToIdentity(makeUser()) as unknown as Record<string, unknown>;
		expect(identity['email']).toBeUndefined();
		expect(identity['app_metadata']).toBeUndefined();
		expect(identity['aud']).toBeUndefined();
		expect(identity['role']).toBeUndefined();
		expect(identity['phone']).toBeUndefined();
		expect(identity['confirmed_at']).toBeUndefined();
		expect(identity['last_sign_in_at']).toBeUndefined();
	});
});
