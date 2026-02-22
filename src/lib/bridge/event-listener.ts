import type { SSEEvent } from '../types';
import type { Task } from '../types';
import { syncTaskToCrm, syncAgentActivityToCrm } from './sync-engine';
import { isBridgeConfigured } from './supabase-client';
import { queryOne } from '../db';

/**
 * Handle an SSE broadcast event and sync relevant data to CRM.
 * Called from the broadcast hook in events.ts.
 */
export async function onBroadcastEvent(event: SSEEvent): Promise<void> {
  if (!isBridgeConfigured()) return;

  try {
    switch (event.type) {
      case 'task_created':
      case 'task_updated': {
        const task = event.payload as Task;
        if (task?.id && task?.title) {
          await syncTaskToCrm(task);
        }
        break;
      }

      case 'task_deleted': {
        // No CRM deletion — just log. CRM tasks persist for audit.
        const payload = event.payload as { id: string };
        console.log(`[Bridge] Task deleted in MC: ${payload.id} — CRM task retained`);
        break;
      }

      case 'agent_spawned': {
        const payload = event.payload as { taskId: string; agentName?: string; sessionId?: string };
        if (payload.agentName) {
          // Look up the task to include its title
          const task = payload.taskId
            ? queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [payload.taskId])
            : null;
          await syncAgentActivityToCrm(
            payload.agentName,
            `Started working on: ${task?.title || payload.taskId || 'unknown task'}`,
            payload.taskId
          );
        }
        break;
      }

      case 'agent_completed': {
        const payload = event.payload as { taskId: string; agentName?: string; summary?: string };
        if (payload.agentName) {
          await syncAgentActivityToCrm(
            payload.agentName,
            `Completed: ${payload.summary || payload.taskId || 'task'}`,
            payload.taskId
          );
        }
        break;
      }

      case 'activity_logged':
      case 'deliverable_added':
        // These are fine-grained — skip to avoid noise
        break;
    }
  } catch (err) {
    console.error('[Bridge] Event listener error:', err);
  }
}
