import { NextRequest, NextResponse } from 'next/server';
import { syncTaskFromCrm } from '@/lib/bridge/sync-engine';
import { pollCrmTasks } from '@/lib/bridge/crm-poller';

/**
 * POST /api/bridge/crm-to-mc
 * Receive a CRM task change and sync to MC.
 * Body: { task: { id, title, description?, status, priority, assigned_agent?, mc_task_id?, sync_source?, due_date? } }
 *
 * Can also be called with { action: "poll" } to trigger an immediate poll cycle.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Trigger manual poll
    if (body.action === 'poll') {
      const stats = await pollCrmTasks();
      return NextResponse.json({ success: true, ...stats });
    }

    // Direct task sync
    const { task } = body;
    if (!task?.id || !task?.title) {
      return NextResponse.json(
        { error: 'task.id and task.title are required' },
        { status: 400 }
      );
    }

    const result = await syncTaskFromCrm(task);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('[Bridge API] crm-to-mc error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
