/**
 * src/lib/supabase.js
 * --------------------
 * Single shared Supabase client for the entire application.
 *
 * RULES:
 *   ✓  Always import this module — never call createClient() in components.
 *   ✓  Uses VITE_ env vars so Vite exposes them to the browser at build time.
 *   ✗  Never import the service_role / secret key anywhere in frontend code.
 *
 * WHEN SUPABASE IS NOT CONFIGURED:
 *   If the env vars are still set to the placeholder strings (or are missing),
 *   this module exports a null client so the existing mock / localStorage
 *   flows continue working without crashing.
 *
 * MIGRATION PATH:
 *   1. Paste real values into .env.local
 *   2. Restart the dev server (Vite re-reads env vars on restart)
 *   3. The service layer in src/services/dbService.js will automatically
 *      start using the live client.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ── Guard: detect placeholder / missing values ────────────────────────────────
const PLACEHOLDER = 'PASTE_THE_SUPABASE_';
const isConfigured =
  supabaseUrl &&
  supabasePublishableKey &&
  !supabaseUrl.startsWith(PLACEHOLDER) &&
  !supabasePublishableKey.startsWith(PLACEHOLDER);

// ── Create the shared client (or null if not configured) ──────────────────────
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        // Persist the session in localStorage so page refreshes don't log out
        persistSession: true,
        // Auto-refresh the JWT token before it expires
        autoRefreshToken: true,
        // We handle our own routing — let Supabase skip URL detection
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * isSupabaseReady
 * ---------------
 * Use this flag anywhere you need to branch between live Supabase
 * and the existing mock/localStorage fallback.
 *
 * Example:
 *   import { isSupabaseReady } from '../lib/supabase';
 *   const clinics = isSupabaseReady
 *     ? await getClinicsFromDB()
 *     : CLINICS;  // mock data
 */
export const isSupabaseReady = isConfigured;

// ── Dev-mode connection test (runs once, logs to console only) ────────────────
// This does NOT render anything on screen and is stripped in production.
if (import.meta.env.DEV) {
  if (!isConfigured) {
    console.warn(
      '[SDQMS] Supabase is NOT configured.\n' +
      'Edit .env.local and replace the placeholder values with your real\n' +
      'Supabase project URL and publishable key, then restart the dev server.'
    );
  } else {
    // Fire a lightweight ping: list tables in the public schema (0 rows read)
    supabase
      .from('_supabase_connection_test_')   // table doesn't need to exist
      .select('id')
      .limit(1)
      .then(({ error }) => {
        // PGRST116 = table not found — that is fine, it just proves the
        // network round-trip and auth succeeded.
        if (!error || error.code === 'PGRST116' || error.code === '42P01') {
          console.info(
            '[SDQMS] ✅ Supabase client initialized and connected successfully.\n' +
            `Project URL: ${supabaseUrl}`
          );
        } else {
          console.error(
            '[SDQMS] ⚠️  Supabase connection test failed.\n' +
            'Check your VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.\n' +
            'Error:', error.message
          );
        }
      });
  }
}
