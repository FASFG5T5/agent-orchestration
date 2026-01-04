/**
 * Type definitions for MCP Memory Orchestrator
 */

import { ulid } from 'ulid';

// ==================== Enums ====================

export enum AgentRole {
  MAIN = 'main',
  SUB = 'sub',
}

export enum AgentStatus {
  ACTIVE = 'active',
  IDLE = 'idle',
  BUSY = 'busy',
  OFFLINE = 'offline',
}

export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum EventType {
  AGENT_REGISTERED = 'agent_registered',
  AGENT_UNREGISTERED = 'agent_unregistered',
  AGENT_HEARTBEAT = 'agent_heartbeat',
  TASK_CREATED = 'task_created',
  TASK_ASSIGNED = 'task_assigned',
  TASK_CLAIMED = 'task_claimed',
  TASK_UPDATED = 'task_updated',
  TASK_COMPLETED = 'task_completed',
  MEMORY_SET = 'memory_set',
  MEMORY_DELETE = 'memory_delete',
  LOCK_ACQUIRED = 'lock_acquired',
  LOCK_RELEASED = 'lock_released',
}

// ==================== Core Types ====================

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: string[];
  metadata: Record<string, unknown>;
  registeredAt: Date;
  lastHeartbeat: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string | null;
  assignedTo: string | null;
  dependencies: string[];
  metadata: Record<string, unknown>;
  output: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  namespace: string;
  createdBy: string | null;
  ttlSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface Lock {
  id: string;
  resource: string;
  heldBy: string;
  acquiredAt: Date;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface Event {
  id: string;
  eventType: EventType;
  agentId: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  timestamp: Date;
}

// ==================== Factory Functions ====================

export function createAgent(params: {
  name: string;
  role?: AgentRole;
  capabilities?: string[];
  status?: AgentStatus;
  metadata?: Record<string, unknown>;
}): Agent {
  const now = new Date();
  return {
    id: ulid(),
    name: params.name,
    role: params.role ?? AgentRole.SUB,
    status: params.status ?? AgentStatus.IDLE,
    capabilities: params.capabilities ?? [],
    metadata: params.metadata ?? {},
    registeredAt: now,
    lastHeartbeat: now,
  };
}

export function createTask(params: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  createdBy?: string | null;
  assignedTo?: string | null;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  status?: TaskStatus;
  startedAt?: Date | null;
}): Task {
  const now = new Date();
  return {
    id: ulid(),
    title: params.title,
    description: params.description ?? '',
    status: params.status ?? TaskStatus.PENDING,
    priority: params.priority ?? TaskPriority.NORMAL,
    createdBy: params.createdBy ?? null,
    assignedTo: params.assignedTo ?? null,
    dependencies: params.dependencies ?? [],
    metadata: params.metadata ?? {},
    output: null,
    createdAt: now,
    updatedAt: now,
    startedAt: params.startedAt ?? null,
    completedAt: null,
  };
}

export function createMemoryEntry(params: {
  key: string;
  value: unknown;
  namespace?: string;
  createdBy?: string | null;
  ttlSeconds?: number | null;
}): MemoryEntry {
  const now = new Date();
  let expiresAt: Date | null = null;

  if (params.ttlSeconds) {
    expiresAt = new Date(now.getTime() + params.ttlSeconds * 1000);
  }

  return {
    id: ulid(),
    key: params.key,
    value: params.value,
    namespace: params.namespace ?? 'default',
    createdBy: params.createdBy ?? null,
    ttlSeconds: params.ttlSeconds ?? null,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };
}

export function createLock(params: {
  resource: string;
  heldBy: string;
  timeoutSeconds?: number;
  metadata?: Record<string, unknown>;
}): Lock {
  const now = new Date();
  const expiresAt = params.timeoutSeconds
    ? new Date(now.getTime() + params.timeoutSeconds * 1000)
    : null;

  return {
    id: ulid(),
    resource: params.resource,
    heldBy: params.heldBy,
    acquiredAt: now,
    expiresAt,
    metadata: params.metadata ?? {},
  };
}

export function createEvent(params: {
  eventType: EventType;
  agentId?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown>;
}): Event {
  return {
    id: ulid(),
    eventType: params.eventType,
    agentId: params.agentId ?? null,
    resourceId: params.resourceId ?? null,
    details: params.details ?? {},
    timestamp: new Date(),
  };
}
