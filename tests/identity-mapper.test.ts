import { describe, it, expect } from 'vitest';
import { userToUpactor } from '../src/identity-mapper.js';
import { makeUser } from './fixtures/user.js';

describe('userToUpactor', () => {
	it('builds the upact Upactor from a Supabase user', () => {
		const upactor = userToUpactor(makeUser());
		expect(upactor.id).toBe('user-1');
		expect(upactor.display_hint).toBe('Alice');
		expect(upactor.capabilities.has('email')).toBe(true);
		expect(upactor.capabilities.has('recovery')).toBe(true);
	});

	it('omits display_hint when user_metadata.display_name is absent', () => {
		const upactor = userToUpactor(makeUser({ user_metadata: {} }));
		expect(upactor).not.toHaveProperty('display_hint');
	});

	it('omits display_hint when display_name is empty after trim', () => {
		const upactor = userToUpactor(makeUser({ user_metadata: { display_name: '   ' } }));
		expect(upactor).not.toHaveProperty('display_hint');
	});

	it('omits display_hint when display_name is not a string', () => {
		const upactor = userToUpactor(makeUser({ user_metadata: { display_name: 123 } }));
		expect(upactor).not.toHaveProperty('display_hint');
	});

	it('returns an empty capability set when user has no email', () => {
		const upactor = userToUpactor(makeUser({ email: undefined }));
		expect(upactor.capabilities.size).toBe(0);
	});

	it('does not derive display_hint from email under any circumstance', () => {
		const upactor = userToUpactor(
			makeUser({ email: 'fallback@example.com', user_metadata: {} }),
		);
		expect(upactor).not.toHaveProperty('display_hint');
	});

	it('does not include lifecycle (audit-trimmed in v0.1)', () => {
		const upactor = userToUpactor(makeUser());
		expect(upactor).not.toHaveProperty('lifecycle');
	});

	it('exposes only the three port-defined fields (Object.keys)', () => {
		const upactor = userToUpactor(makeUser());
		expect(Object.keys(upactor).sort()).toEqual([
			'capabilities',
			'display_hint',
			'id',
		]);
	});

	it('exposes only the two port-defined fields when display_hint is absent', () => {
		const upactor = userToUpactor(makeUser({ user_metadata: {} }));
		expect(Object.keys(upactor).sort()).toEqual(['capabilities', 'id']);
	});

	it('serialises with no substrate fields (JSON.stringify privacy assertion)', () => {
		const upactor = userToUpactor(makeUser());
		const json = JSON.stringify(upactor);
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
		const upactor = userToUpactor(makeUser()) as unknown as Record<string, unknown>;
		expect(upactor['email']).toBeUndefined();
		expect(upactor['app_metadata']).toBeUndefined();
		expect(upactor['aud']).toBeUndefined();
		expect(upactor['role']).toBeUndefined();
		expect(upactor['phone']).toBeUndefined();
		expect(upactor['confirmed_at']).toBeUndefined();
		expect(upactor['last_sign_in_at']).toBeUndefined();
		expect(upactor['lifecycle']).toBeUndefined();
	});

	it('id passes through user.id (Supabase substrate provides a stable opaque UUID)', () => {
		const upactor = userToUpactor(makeUser({ id: 'fixed-supabase-uuid' }));
		expect(upactor.id).toBe('fixed-supabase-uuid');
	});

	it('id is deterministic — same user.id yields same upactor.id', () => {
		const a = userToUpactor(makeUser({ id: 'fixed-1' }));
		const b = userToUpactor(makeUser({ id: 'fixed-1' }));
		expect(a.id).toBe(b.id);
	});

	it('id is distinct for distinct user.id values', () => {
		const a = userToUpactor(makeUser({ id: 'user-a' }));
		const b = userToUpactor(makeUser({ id: 'user-b' }));
		expect(a.id).not.toBe(b.id);
	});
});
