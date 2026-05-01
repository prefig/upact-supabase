import type { User } from '@supabase/supabase-js';
import type { Upactor } from '@prefig/upact';
import { capabilitiesFromUser } from './capabilities.js';

/**
 * Map a Supabase substrate User into a port-shaped Upactor.
 *
 * PII stripping is enforced by construction — only the three allowed
 * Upactor fields (id, display_hint, capabilities) are placed on the
 * returned object. No fields are copied from `user` and then deleted;
 * forbidden fields are simply never read.
 *
 * The display hint, when present, is sourced exclusively from
 * `user_metadata.display_name`. It is never derived from email or any
 * other substrate identifier (per upact §7.1, §4.2). When absent or
 * empty, the field is omitted entirely from the returned object.
 *
 * Lifecycle was deferred from upact v0.1 by audit (no concrete consumer);
 * Phase C brings it back when JWT exp-driven `expires_at` becomes a real
 * consumer need.
 *
 * Exported as a sync convenience so that consumers whose substrate
 * populates a User object synchronously (e.g. SvelteKit hooks placing
 * `event.locals.user`) can keep their identity-derivation paths sync.
 * The async port operations on the adapter wrap this transparently.
 */
export function userToUpactor(user: User): Upactor {
	const displayHint = readDisplayHint(user);
	return {
		id: user.id,
		...(displayHint !== undefined ? { display_hint: displayHint } : {}),
		capabilities: capabilitiesFromUser(user),
	};
}

/**
 * @deprecated Renamed to `userToUpactor` for v0.1. This alias remains for
 * v0.1.x compatibility and will be removed in v0.2.
 */
export const userToIdentity = userToUpactor;

function readDisplayHint(user: User): string | undefined {
	const raw = user.user_metadata?.display_name;
	if (typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
