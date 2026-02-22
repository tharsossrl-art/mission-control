import { NextRequest, NextResponse } from 'next/server';
import { syncTaskToCrm } from '@/lib/bridge/sync-engine';
import { queryOne } from '@/lib/db';
import type { Task } from '@/lib/types';

/**
 * POST /api/bridge/mc-to-crm
 * Manually trigger sync of an MC task to CRM Supabase.
 * Body: { task_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { task_id } = await request.json();

    if (!task_id) {
      return NextResponse.json({ error: 'task_id required' }, { status: 400 });
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task_id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found in MC' }, { status: 404 });
    }

    const result = await syncTaskToCrm(task);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error('[Bridge API] mc-to-crm error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
