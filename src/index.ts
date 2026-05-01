// SPDX-License-Identifier: Apache-2.0

export {
	createSupabaseAdapter,
	type SupabaseCredential,
} from './adapter.js';
export { userToUpactor } from './identity-mapper.js';
/** @deprecated Use `userToUpactor` instead. Removed in v0.2. */
export { userToIdentity } from './identity-mapper.js';
export { capabilitiesFromUser } from './capabilities.js';

export type {
	Upactor,
	/** @deprecated Use `Upactor` instead. Removed in v0.2. */
	UserIdentity,
	Capability,
	Session,
	AuthError,
	AuthErrorCode,
	IdentityPort,
} from '@prefig/upact';
export { SubstrateUnavailableError } from '@prefig/upact';
