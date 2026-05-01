// SPDX-License-Identifier: Apache-2.0
/**
 * Decision 11 (SPEC.md §7.5) adapter back-channel closure conformance.
 *
 * Substrate state held by the adapter MUST NOT be reachable through
 * reflection on the public adapter object. The factory holds the
 * SupabaseClient in closure scope. The adapter passes sixteen
 * reflection vectors from `@prefig/upact/tests/runtime.test.ts`,
 * applied here to the adapter instance.
 */

import { describe, it, expect, vi } from 'vitest';
import util from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdapter } from '../src/adapter.js';

// Sentinel substrings that would only be reachable if the SupabaseClient
// leaked through reflection on the adapter.
const SENTINEL_AUTH_TOKEN = 'eyJsentinelAccessToken_DO_NOT_LEAK';
const SENTINEL_PROJECT_URL = 'sentinel-project-DO_NOT_LEAK.supabase.co';
const SENTINEL_API_KEY = 'sentinelApiKey_DO_NOT_LEAK';

function makeSentinelSupabase(): SupabaseClient {
	// A SupabaseClient-shaped object whose internal fields contain
	// recognisable sentinel strings — if any reflection on the adapter
	// surfaces these strings, the back-channel closure has leaked.
	return {
		auth: {
			getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
			signInWithPassword: vi.fn(),
			signInWithOtp: vi.fn(),
			signOut: vi.fn(),
			refreshSession: vi.fn(),
			__internalToken: SENTINEL_AUTH_TOKEN,
		},
		supabaseUrl: SENTINEL_PROJECT_URL,
		supabaseKey: SENTINEL_API_KEY,
	} as unknown as SupabaseClient;
}

function assertNoLeak(adapter: object, label: string): void {
	const sentinels = [SENTINEL_AUTH_TOKEN, SENTINEL_PROJECT_URL, SENTINEL_API_KEY];

	// 1. JSON.stringify
	const json = JSON.stringify(adapter);
	for (const s of sentinels) {
		expect(json, `${label}: leak via JSON.stringify (${s})`).not.toContain(s);
	}

	// 2. Object.keys
	const keys = Object.keys(adapter);
	for (const k of keys) {
		const val = (adapter as Record<string, unknown>)[k];
		const valStr = JSON.stringify(val) ?? '';
		for (const s of sentinels) {
			expect(valStr, `${label}: leak via Object.keys[${k}] (${s})`).not.toContain(s);
		}
	}

	// 3. Object.getOwnPropertyNames
	const ownNames = Object.getOwnPropertyNames(adapter);
	for (const n of ownNames) {
		const val = (adapter as Record<string, unknown>)[n];
		const valStr = JSON.stringify(val) ?? '';
		for (const s of sentinels) {
			expect(valStr, `${label}: leak via getOwnPropertyNames[${n}] (${s})`).not.toContain(s);
		}
	}

	// 4. Reflect.ownKeys
	const reflectKeys = Reflect.ownKeys(adapter);
	for (const k of reflectKeys) {
		const val = (adapter as Record<string | symbol, unknown>)[k];
		const valStr = JSON.stringify(val) ?? '';
		for (const s of sentinels) {
			expect(valStr, `${label}: leak via Reflect.ownKeys[${String(k)}] (${s})`).not.toContain(s);
		}
	}

	// 5. Object.getOwnPropertySymbols
	const symbols = Object.getOwnPropertySymbols(adapter);
	for (const sym of symbols) {
		const val = (adapter as Record<symbol, unknown>)[sym];
		const valStr = JSON.stringify(val) ?? '';
		for (const s of sentinels) {
			expect(valStr, `${label}: leak via getOwnPropertySymbols[${String(sym)}] (${s})`).not.toContain(s);
		}
	}

	// 6. for-in
	const forInValues: unknown[] = [];
	for (const k in adapter) {
		forInValues.push((adapter as Record<string, unknown>)[k]);
	}
	const forInStr = JSON.stringify(forInValues);
	for (const s of sentinels) {
		expect(forInStr, `${label}: leak via for-in (${s})`).not.toContain(s);
	}

	// 7. structuredClone — methods don't survive; the clone shouldn't
	// contain substrate state either way
	let cloned: unknown;
	try {
		cloned = structuredClone(adapter);
	} catch {
		// methods can't be cloned; that's expected for the factory form
		cloned = {};
	}
	const cloneStr = JSON.stringify(cloned);
	for (const s of sentinels) {
		expect(cloneStr, `${label}: leak via structuredClone (${s})`).not.toContain(s);
	}

	// 8. util.inspect with all the depth/hidden options on
	const inspected = util.inspect(adapter, {
		depth: null,
		showHidden: true,
		showProxy: true,
		getters: true,
	});
	for (const s of sentinels) {
		expect(inspected, `${label}: leak via util.inspect (${s})`).not.toContain(s);
	}

	// 9–11. Direct property access by name
	const probeNames = ['supabase', 'client', 'auth', 'supabaseUrl', 'supabaseKey'];
	for (const name of probeNames) {
		const val = (adapter as Record<string, unknown>)[name];
		const valStr = JSON.stringify(val) ?? '';
		for (const s of sentinels) {
			expect(valStr, `${label}: leak via adapter.${name} (${s})`).not.toContain(s);
		}
	}

	// 12–13. Cast access
	const castAdapter = adapter as Record<string, unknown>;
	expect(castAdapter['supabase'], `${label}: (adapter as any).supabase`).toBeUndefined();
	expect(castAdapter['client'], `${label}: (adapter as any).client`).toBeUndefined();

	// 14. Frozen-state inspection — freeze the adapter and verify substrate still doesn't leak
	Object.freeze(adapter);
	const frozenJson = JSON.stringify(adapter);
	for (const s of sentinels) {
		expect(frozenJson, `${label}: leak via Object.freeze + JSON.stringify (${s})`).not.toContain(s);
	}

	// 15. JSON.stringify nested in a wrapper
	const wrapped = { kind: 'adapter-holder', adapter };
	const wrappedJson = JSON.stringify(wrapped);
	for (const s of sentinels) {
		expect(wrappedJson, `${label}: leak via wrapper JSON.stringify (${s})`).not.toContain(s);
	}

	// 16. Object spread
	const spread = { ...adapter };
	const spreadStr = JSON.stringify(spread);
	for (const s of sentinels) {
		expect(spreadStr, `${label}: leak via {...adapter} (${s})`).not.toContain(s);
	}
}

describe('Decision 11 — adapter back-channel closure', () => {
	it('createSupabaseAdapter does not leak SupabaseClient via any reflection vector', () => {
		const supabase = makeSentinelSupabase();
		const adapter = createSupabaseAdapter(supabase);
		assertNoLeak(adapter, 'createSupabaseAdapter');
	});

	it('cast access to common substrate-property names returns undefined', () => {
		const supabase = makeSentinelSupabase();
		const adapter = createSupabaseAdapter(supabase);
		// the SupabaseClient lives in closure; no instance property holds it
		expect((adapter as Record<string, unknown>)['supabase']).toBeUndefined();
		expect((adapter as Record<string, unknown>)['client']).toBeUndefined();
		expect((adapter as Record<string, unknown>)['_supabase']).toBeUndefined();
		expect((adapter as Record<string, unknown>)['#supabase']).toBeUndefined();
	});
});
