import { createClient } from '@supabase/supabase-js';

export function normalizeSupabaseEnvironment(value) {
  const normalized = String(value ?? '').trim();
  if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) return normalized.slice(1, -1).trim();
  return normalized;
}

const supabaseUrl = normalizeSupabaseEnvironment(import.meta.env?.VITE_SUPABASE_URL);
const supabaseAnonKey = normalizeSupabaseEnvironment(import.meta.env?.VITE_SUPABASE_ANON_KEY);
const expectedProjectUrl = 'https://fgelzlxfqeooxvvcpndd.supabase.co';

export const supabaseConfiguration = Object.freeze({
  configured: Boolean(supabaseUrl && supabaseAnonKey),
  projectMatches: supabaseUrl === expectedProjectUrl,
});

export function assertSupabaseConfigured() {
  if (!supabaseConfiguration.configured) throw Object.assign(new Error('The Preview deployment is missing its Supabase connection settings.'), { code: 'SUPABASE_CONFIGURATION_MISSING' });
  if (!supabaseConfiguration.projectMatches) throw Object.assign(new Error('The Preview deployment is connected to an unexpected Supabase project.'), { code: 'SUPABASE_PROJECT_MISMATCH' });
}

if (!supabaseConfiguration.configured) {
  console.warn('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your local env file.');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key', {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    persistSession: true,
  },
});
