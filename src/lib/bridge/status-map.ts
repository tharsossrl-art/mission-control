import type { TaskStatus } from '../types';

// CRM uses 3 statuses: 'todo' | 'doing' | 'done'
export type CRMTaskStatus = 'todo' | 'doing' | 'done';

// MC → CRM status mapping
const MC_TO_CRM: Record<TaskStatus, CRMTaskStatus> = {
  planning: 'todo',
  inbox: 'todo',
  assigned: 'todo',
  in_progress: 'doing',
  testing: 'doing',
  review: 'doing',
  done: 'done',
};

// CRM → MC status mapping (conservative — puts into earliest reasonable stage)
const CRM_TO_MC: Record<CRMTaskStatus, TaskStatus> = {
  todo: 'inbox',
  doing: 'in_progress',
  done: 'done',
};

export function mcStatusToCrm(mcStatus: TaskStatus): CRMTaskStatus {
  return MC_TO_CRM[mcStatus] ?? 'todo';
}

export function crmStatusToMc(crmStatus: string): TaskStatus {
  return CRM_TO_MC[crmStatus as CRMTaskStatus] ?? 'inbox';
}

// Agent ID mapping: MC uses lowercase, CRM uses uppercase
// MC stores UUIDs but agents have canonical names
const AGENT_NAME_TO_CRM_ID: Record<string, string> = {
  Victor: 'VICTOR',
  Radu: 'BUILDER',
  Alexandra: 'COMMS',
  Anabelle: 'PIXEL',
  Mihai: 'SENTINEL',
  Apex: 'APEX',
};

const CRM_ID_TO_AGENT_NAME: Record<string, string> = {
  VICTOR: 'Victor',
  BUILDER: 'Radu',
  COMMS: 'Alexandra',
  PIXEL: 'Anabelle',
  SENTINEL: 'Mihai',
  APEX: 'Apex',
};

export function mcAgentNameToCrmId(mcName: string): string | null {
  return AGENT_NAME_TO_CRM_ID[mcName] ?? null;
}

export function crmAgentIdToMcName(crmId: string): string | null {
  return CRM_ID_TO_AGENT_NAME[crmId.toUpperCase()] ?? null;
}

// Priority mapping: MC uses 'low'|'normal'|'high'|'urgent', CRM uses 'low'|'medium'|'high'|'urgent'
export function mcPriorityToCrm(p: string): string {
  return p === 'normal' ? 'medium' : p;
}

export function crmPriorityToMc(p: string): string {
  return p === 'medium' ? 'normal' : p;
}
