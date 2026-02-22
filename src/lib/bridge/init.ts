import { startPoller } from './crm-poller';
import { isBridgeConfigured } from './supabase-client';

let initialized = false;

/**
 * Initialize the bridge subsystem. Safe to call multiple times — only runs once.
 * Called from the broadcast hook in events.ts on first event.
 */
export function ensureBridgeInitialized(): void {
  if (initialized) return;
  initialized = true;

  if (!isBridgeConfigured()) {
    console.log('[Bridge] Not configured — bridge disabled');
    return;
  }

  console.log('[Bridge] Initializing — starting CRM poller');
  startPoller();
}
