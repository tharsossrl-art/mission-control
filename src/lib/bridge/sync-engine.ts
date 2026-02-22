import { getSupabaseClient, isBridgeConfigured } from './supabase-client';
import {
  mcStatusToCrm,
  crmStatusToMc,
  mcAgentNameToCrmId,
  crmAgentIdToMcName,
  mcPriorityToCrm,
  crmPriorityToMc,
} from './status-map';
import { queryOne, queryAll, run } from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../types';

const BRIDGE_SOURCE = 'mc-bridge';
const DEDUP_TTL_MS = 30_000;

// Anti-loop: recently synced task IDs with timestamps
const recentlySynced = new Map<string, number>();

function markSynced(key: string): void {
  recentlySynced.set(key, Date.now());
}

function wasSyncedRecently(key: string): boolean {
  const ts = recentlySynced.get(key);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    recentlySynced.delete(key);
    return false;
  }
  return true;
}

// Periodically clean expired entries
setInterval(() => {
  const now = Date.now();
  recentlySynced.forEach((ts, key) => {
    if (now - ts > DEDUP_TTL_MS) recentlySynced.delete(key);
  });
}, 60_000);

/**
 * Resolve MC agent UUID to agent name by querying the agents table
 */
function resolveAgentName(agentId: string | null): string | null {
  if (!agentId) return null;
  const agent = queryOne<{ name: string }>('SELECT name FROM agents WHERE id = ?', [agentId]);
  return agent?.name ?? null;
}

/**
 * Resolve MC agent name to UUID
 */
function resolveAgentId(agentName: string): string | null {
  const agent = queryOne<{ id: string }>('SELECT id FROM agents WHERE name = ?', [agentName]);
  return agent?.id ?? null;
}

/**
 * Push an MC task to CRM Supabase
 */
export async function syncTaskToCrm(mcTask: Task): Promise<{ success: boolean; error?: string }> {
  if (!isBridgeConfigured()) return { success: false, error: 'Bridge not configured' };

  const dedupKey = `mc-to-crm:${mcTask.id}`;
  if (wasSyncedRecently(dedupKey)) {
    return { success: true, error: 'Skipped — recently synced' };
  }

  try {
    const supabase = getSupabaseClient();
    const agentName = resolveAgentName(mcTask.assigned_agent_id);
    const crmAgentId = agentName ? mcAgentNameToCrmId(agentName) : null;

    // Check if task already exists in CRM (by mc_task_id)
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('mc_task_id', mcTask.id)
      .maybeSingle();

    const crmPayload = {
      title: mcTask.title,
      description: mcTask.description || null,
      status: mcStatusToCrm(mcTask.status),
      priority: mcPriorityToCrm(mcTask.priority),
      assigned_agent: crmAgentId,
      mc_task_id: mcTask.id,
      mc_status: mcTask.status,
      sync_source: BRIDGE_SOURCE,
      agency_id: 'apprapid',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      // Update
      const { error } = await supabase
        .from('tasks')
        .update(crmPayload)
        .eq('mc_task_id', mcTask.id);

      if (error) return { success: false, error: error.message };
    } else {
      // Insert
      const { error } = await supabase
        .from('tasks')
        .insert({ ...crmPayload, id: uuidv4(), created_at: new Date().toISOString() });

      if (error) return { success: false, error: error.message };
    }

    markSynced(dedupKey);
    console.log(`[Bridge] MC → CRM synced task "${mcTask.title}" (${mcTask.status})`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Bridge] MC → CRM error:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Push agent activity to CRM Supabase
 */
export async function syncAgentActivityToCrm(
  agentName: string,
  activity: string,
  taskId?: string
): Promise<void> {
  if (!isBridgeConfigured()) return;

  try {
    const supabase = getSupabaseClient();
    const crmAgentId = mcAgentNameToCrmId(agentName);

    await supabase.from('agent_activity').insert({
      id: uuidv4(),
      agent_id: crmAgentId || agentName.toUpperCase(),
      status: 'working',
      task: activity,
      activity_type: 'task_update',
      message: activity,
      task_id: taskId || null,
      sync_source: BRIDGE_SOURCE,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Bridge] Agent activity sync error:', err);
  }
}

/**
 * Pull a CRM task into MC's SQLite
 */
export async function syncTaskFromCrm(crmTask: {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigned_agent?: string;
  mc_task_id?: string;
  sync_source?: string;
  due_date?: string;
}): Promise<{ success: boolean; action: 'created' | 'updated' | 'skipped'; error?: string }> {
  // Skip if this change originated from the bridge
  if (crmTask.sync_source === BRIDGE_SOURCE) {
    return { success: true, action: 'skipped' };
  }

  const dedupKey = `crm-to-mc:${crmTask.id}`;
  if (wasSyncedRecently(dedupKey)) {
    return { success: true, action: 'skipped' };
  }

  try {
    const mcStatus = crmStatusToMc(crmTask.status);
    const mcPriority = crmPriorityToMc(crmTask.priority || 'medium');

    // Resolve assigned agent
    let assignedAgentId: string | null = null;
    if (crmTask.assigned_agent) {
      const mcAgentName = crmAgentIdToMcName(crmTask.assigned_agent);
      if (mcAgentName) {
        assignedAgentId = resolveAgentId(mcAgentName);
      }
    }

    // Check if MC already has this task (by CRM ID stored in business_id or direct match)
    if (crmTask.mc_task_id) {
      const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [crmTask.mc_task_id]);
      if (existing) {
        run(
          `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?`,
          [crmTask.title, crmTask.description || null, mcStatus, mcPriority, assignedAgentId, new Date().toISOString(), crmTask.mc_task_id]
        );
        markSynced(dedupKey);
        console.log(`[Bridge] CRM → MC updated task "${crmTask.title}"`);
        return { success: true, action: 'updated' };
      }
    }

    // Check by title match (fallback)
    const byTitle = queryOne<Task>('SELECT * FROM tasks WHERE title = ? AND workspace_id = ?', [crmTask.title, 'default']);
    if (byTitle) {
      run(
        `UPDATE tasks SET description = ?, status = ?, priority = ?, assigned_agent_id = ?, updated_at = ? WHERE id = ?`,
        [crmTask.description || null, mcStatus, mcPriority, assignedAgentId, new Date().toISOString(), byTitle.id]
      );

      // Update CRM with the MC task ID for future syncs
      if (isBridgeConfigured()) {
        const supabase = getSupabaseClient();
        await supabase.from('tasks').update({ mc_task_id: byTitle.id }).eq('id', crmTask.id);
      }

      markSynced(dedupKey);
      console.log(`[Bridge] CRM → MC updated task by title "${crmTask.title}"`);
      return { success: true, action: 'updated' };
    }

    // Create new task in MC
    const newId = uuidv4();
    const now = new Date().toISOString();
    run(
      `INSERT INTO tasks (id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId, crmTask.title, crmTask.description || null, mcStatus, mcPriority, assignedAgentId, 'default', '', crmTask.due_date || null, now, now]
    );

    // Update CRM with the MC task ID
    if (isBridgeConfigured()) {
      const supabase = getSupabaseClient();
      await supabase.from('tasks').update({ mc_task_id: newId, sync_source: BRIDGE_SOURCE }).eq('id', crmTask.id);
    }

    markSynced(dedupKey);
    console.log(`[Bridge] CRM → MC created task "${crmTask.title}" → ${newId}`);
    return { success: true, action: 'created' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Bridge] CRM → MC error:', msg);
    return { success: false, action: 'skipped', error: msg };
  }
}

export function getSyncStats() {
  return {
    recentlySyncedCount: recentlySynced.size,
    bridgeConfigured: isBridgeConfigured(),
  };
}
