/**
 * @prefig/upact-supabase — Supabase Auth adapter for upact.
 *
 * License: Apache-2.0
 */

export { SupabaseUpactAdapter, type SupabaseCredential } from './adapter.js';
export { userToIdentity } from './identity-mapper.js';
export { capabilitiesFromUser } from './capabilities.js';

export type {
	UserIdentity,
	IdentityLifecycle,
	Capability,
	Session,
	AuthError,
	IdentityPort,
	IdentityDecayAware,
} from '@prefig/upact';
