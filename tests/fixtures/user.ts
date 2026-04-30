import type { User } from '@supabase/supabase-js';

/**
 * Build a Supabase substrate User for tests.
 *
 * The defaults are deliberately PII-rich (email, app_metadata.role,
 * confirmed_at, last_sign_in_at, identities[]) so that privacy tests
 * have something to assert against — every default field is one the
 * port forbids on UserIdentity, and every test that asserts privacy
 * MUST verify the field doesn't appear on the mapped output.
 */
export function makeUser(overrides: Partial<User> = {}): User {
	return {
		id: 'user-1',
		aud: 'authenticated',
		role: 'authenticated',
		email: 'a@example.com',
		email_confirmed_at: '2026-01-01T00:00:00Z',
		phone: '',
		confirmed_at: '2026-01-01T00:00:00Z',
		last_sign_in_at: '2026-04-18T00:00:00Z',
		app_metadata: { provider: 'email', role: 'admin' },
		user_metadata: { display_name: 'Alice' },
		identities: [],
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-04-18T00:00:00Z',
		...overrides,
	} as User;
}
