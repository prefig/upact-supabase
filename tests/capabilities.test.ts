import { describe, it, expect } from 'vitest';
import { capabilitiesFromUser } from '../src/capabilities.js';
import { makeUser } from './fixtures/user.js';

describe('capabilitiesFromUser', () => {
	it('returns email and recovery for a Supabase user with an email', () => {
		const caps = capabilitiesFromUser(makeUser());
		expect(caps.has('email')).toBe(true);
		expect(caps.has('recovery')).toBe(true);
		expect(caps.size).toBe(2);
	});

	it('returns an empty set when the user has no email', () => {
		const caps = capabilitiesFromUser(makeUser({ email: undefined }));
		expect(caps.size).toBe(0);
	});

	it('returns an empty set when the email is empty-string', () => {
		const caps = capabilitiesFromUser(makeUser({ email: '' }));
		expect(caps.size).toBe(0);
	});

	it('does not surface unrelated capabilities', () => {
		const caps = capabilitiesFromUser(makeUser());
		expect(caps.has('push')).toBe(false);
		expect(caps.has('webauthn')).toBe(false);
		expect(caps.has('presence_renewal')).toBe(false);
		expect(caps.has('threshold_attestation')).toBe(false);
		expect(caps.has('p2p_matching')).toBe(false);
	});
});
