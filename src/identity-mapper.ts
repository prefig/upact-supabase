import type { User } from '@supabase/supabase-js';
import type { UserIdentity } from '@prefig/upact';
import { capabilitiesFromUser } from './capabilities.js';

/**
 * Map a Supabase substrate User into a port-shaped UserIdentity.
 *
 * PII stripping is enforced by construction — only the four allowed
 * fields (id, display_hint, lifecycle, capabilities) are placed on the
 * returned object. No fields are copied from `user` and then deleted;
 * forbidden fields are simply never read.
 *
 * The display hint, when present, is sourced exclusively from
 * `user_metadata.display_name`. It is never derived from email or any
 * other substrate identifier (per upact §7.1, §4.2). When absent or
 * empty, the field is omitted entirely from the returned object.
 *
 * Exported as a sync convenience so that consumers whose substrate
 * populates a User object synchronously (e.g. SvelteKit hooks placing
 * `event.locals.user`) can keep their identity-derivation paths sync.
 * The async port operations on the adapter wrap this transparently.
 */
export function userToIdentity(user: User): UserIdentity {
	const displayHint = readDisplayHint(user);
	return {
		id: user.id,
		...(displayHint !== undefined ? { display_hint: displayHint } : {}),
		lifecycle: {
			issued_at: user.created_at,
			renewable: 'reauth',
		},
		capabilities: capabilitiesFromUser(user),
	};
}

function readDisplayHint(user: User): string | undefined {
	const raw = user.user_metadata?.display_name;
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
