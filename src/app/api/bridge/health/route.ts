import { NextResponse } from 'next/server';
import { isBridgeConfigured, getSupabaseClient } from '@/lib/bridge/supabase-client';
import { getPollerStatus } from '@/lib/bridge/crm-poller';
import { getSyncStats } from '@/lib/bridge/sync-engine';
import { getOpenClawClient } from '@/lib/openclaw/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: 'ok' | 'warn' | 'error'; detail: string }> = {};

  // 1. Bridge configuration
  const configured = isBridgeConfigured();
  checks.bridge_config = configured
    ? { status: 'ok', detail: 'Supabase URL and service key configured' }
    : { status: 'error', detail: 'BRIDGE_SUPABASE_URL or BRIDGE_SUPABASE_SERVICE_KEY missing' };

  // 2. Supabase connectivity
  if (configured) {
    try {
      const supabase = getSupabaseClient();
      const { count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true });

      checks.supabase = error
        ? { status: 'error', detail: `Query failed: ${error.message}` }
        : { status: 'ok', detail: `Connected — ${count ?? 0} tasks in CRM` };
    } catch (err) {
      checks.supabase = {
        status: 'error',
        detail: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  } else {
    checks.supabase = { status: 'warn', detail: 'Skipped — bridge not configured' };
  }

  // 3. CRM Poller
  const poller = getPollerStatus();
  checks.crm_poller = poller.running
    ? { status: 'ok', detail: `Running — last poll: ${poller.lastPollTime}` }
    : { status: 'warn', detail: 'Not running' };

  // 4. Sync stats
  const stats = getSyncStats();
  checks.sync_engine = {
    status: 'ok',
    detail: `Dedup cache: ${stats.recentlySyncedCount} entries`,
  };

  // 5. Gateway connection
  try {
    const client = getOpenClawClient();
    checks.gateway = client.isConnected()
      ? { status: 'ok', detail: 'WebSocket connected' }
      : { status: 'warn', detail: 'WebSocket not connected' };
  } catch {
    checks.gateway = { status: 'warn', detail: 'Gateway client not initialized' };
  }

  // Overall status
  const hasError = Object.values(checks).some((c) => c.status === 'error');
  const hasWarn = Object.values(checks).some((c) => c.status === 'warn');
  const overall = hasError ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy';

  return NextResponse.json({ status: overall, checks, timestamp: new Date().toISOString() });
}
