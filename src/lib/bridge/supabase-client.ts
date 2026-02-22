import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.BRIDGE_SUPABASE_URL;
  const key = process.env.BRIDGE_SUPABASE_SERVICE_KEY;

  if (!url || !key || key.startsWith('<')) {
    throw new Error(
      'Bridge Supabase not configured. Set BRIDGE_SUPABASE_URL and BRIDGE_SUPABASE_SERVICE_KEY in .env.local'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

export function isBridgeConfigured(): boolean {
  const url = process.env.BRIDGE_SUPABASE_URL;
  const key = process.env.BRIDGE_SUPABASE_SERVICE_KEY;
  return !!(url && key && !key.startsWith('<'));
}
