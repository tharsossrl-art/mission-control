import { isBridgeConfigured, getSupabaseClient } from './supabase-client';
import { syncTaskFromCrm } from './sync-engine';

const POLL_INTERVAL_MS = 30_000;
let pollerInterval: ReturnType<typeof setInterval> | null = null;
let lastPollTime: string = new Date().toISOString();
let isPolling = false;

async function pollCrmTasks(): Promise<{ polled: number; synced: number; errors: number }> {
  if (!isBridgeConfigured() || isPolling) return { polled: 0, synced: 0, errors: 0 };
  isPolling = true;

  let polled = 0, synced = 0, errors = 0;

  try {
    const supabase = getSupabaseClient();

    // Fetch tasks updated since last poll
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .gt('updated_at', lastPollTime)
      .neq('sync_source', 'mc-bridge')
      .order('updated_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[Bridge Poller] Supabase query error:', error.message);
      return { polled: 0, synced: 0, errors: 1 };
    }

    if (!tasks || tasks.length === 0) return { polled: 0, synced: 0, errors: 0 };

    polled = tasks.length;
    console.log(`[Bridge Poller] Found ${polled} updated CRM tasks since ${lastPollTime}`);

    for (const task of tasks) {
      const result = await syncTaskFromCrm(task);
      if (result.success && result.action !== 'skipped') synced++;
      if (!result.success) errors++;
    }

    // Update last poll time to the most recent task
    lastPollTime = tasks[tasks.length - 1].updated_at;
  } catch (err) {
    console.error('[Bridge Poller] Error:', err);
    errors++;
  } finally {
    isPolling = false;
  }

  return { polled, synced, errors };
}

export function startPoller(): void {
  if (pollerInterval) return;
  if (!isBridgeConfigured()) {
    console.log('[Bridge Poller] Supabase not configured, poller disabled');
    return;
  }

  console.log(`[Bridge Poller] Starting — polling every ${POLL_INTERVAL_MS / 1000}s`);
  pollerInterval = setInterval(pollCrmTasks, POLL_INTERVAL_MS);

  // Run first poll immediately
  pollCrmTasks().catch(console.error);
}

export function stopPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[Bridge Poller] Stopped');
  }
}

export function getPollerStatus(): { running: boolean; lastPollTime: string } {
  return {
    running: pollerInterval !== null,
    lastPollTime,
  };
}

export { pollCrmTasks };
