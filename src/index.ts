/**
 * @prefig/upact-supabase — Supabase Auth adapter for upact.
 *
 * License: Apache-2.0
 */

export {
	createSupabaseAdapter,
	type SupabaseCredential,
} from './adapter.js';
export { userToUpactor, userToIdentity } from './identity-mapper.js';
export { capabilitiesFromUser } from './capabilities.js';

export type {
	Upactor,
	UserIdentity, // deprecated alias
	Capability,
	Session,
	AuthError,
	AuthErrorCode,
	IdentityPort,
} from '@prefig/upact';
export { SubstrateUnavailableError } from '@prefig/upact';
