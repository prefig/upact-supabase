import type { User } from '@supabase/supabase-js';
import type { Capability } from '@prefig/upact';

/**
 * Derive the upact capability set from a Supabase substrate User.
 *
 * Supabase recovery is email-based, so 'recovery' is bound to 'email' on
 * this substrate. A user without an email has no capabilities exposed via
 * the port; per-spec, applications branch on capability presence and
 * degrade accordingly.
 *
 * The returned set is frozen — capabilities are derived from substrate
 * inspection at construction time, not configured.
 */
export function capabilitiesFromUser(user: User): ReadonlySet<Capability> {
	const caps = new Set<Capability>();
	if (typeof user.email === 'string' && user.email.length > 0) {
		caps.add('email');
		caps.add('recovery');
	}
	return Object.freeze(caps);
}
