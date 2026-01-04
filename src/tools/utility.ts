/**
 * Utility tools (bootstrap, claim_todo)
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabase } from '../database.js';
import { AgentRole, AgentStatus, TaskPriority, TaskStatus } from '../models.js';
import {
  getCurrentAgentId,
  setCurrentAgent,
} from './agent.js';
import { syncToActiveContext } from '../utils/contextSync.js';

export function registerUtilityTools(server: McpServer): void {
  // bootstrap
  server.tool(
    'bootstrap',
    'Initialize agent session: register (if needed), get current focus, pending tasks, and recent decisions. Call this once at the start of your session.',
    {
      name: z
        .string()
        .optional()
        .describe('Agent name. If not provided, uses env MCP_ORCH_AGENT_NAME or generates one.'),
      role: z
        .enum(['main', 'sub'])
        .optional()
        .default('sub')
        .describe("Agent role. Defaults to env MCP_ORCH_AGENT_ROLE or 'sub'."),
    },
    async ({ name, role }) => {
      const db = getDatabase();

      // Get or generate agent name
      let agentName = name ?? process.env.MCP_ORCH_AGENT_NAME;
      if (!agentName) {
        agentName = `agent-${Date.now()}`;
      }

      const agentRole =
        role === 'main'
          ? AgentRole.MAIN
          : role === 'sub'
            ? AgentRole.SUB
            : process.env.MCP_ORCH_AGENT_ROLE === 'main'
              ? AgentRole.MAIN
              : AgentRole.SUB;

      const capabilities = (process.env.MCP_ORCH_CAPABILITIES ?? 'code').split(',');

      // Check if agent already exists
      let agent = db.getAgentByName(agentName);

      if (agent) {
        // Reconnect
        setCurrentAgent(agent.id, agent.name);
        db.updateAgentHeartbeat(agent.id, AgentStatus.ACTIVE);
      } else {
        // Register new
        agent = db.createAgent({
          name: agentName,
          role: agentRole,
          capabilities,
          status: AgentStatus.ACTIVE,
        });
        setCurrentAgent(agent.id, agent.name);
      }

      // Get current context
      const focusEntry = db.getMemory('current_focus', 'context');
      const focusText = focusEntry ? String(focusEntry.value) : 'Not set';

      // Get pending tasks for this agent
      const myTasks = db.listTasks({ assignedTo: agent.id });
      const pendingTasks = myTasks.filter((t) =>
        ['pending', 'assigned'].includes(t.status)
      );

      // Get recent decisions
      const decisions = db.listMemory('decisions');

      // Sync context
      syncToActiveContext();

      const lines: string[] = [
        '# Session Initialized',
        '',
        `**Agent**: ${agent.name} (\`${agent.id}\`)`,
        `**Role**: ${agent.role}`,
        '',
        '## Current Focus',
        focusText,
        '',
        '## Your Pending Tasks',
      ];

      if (pendingTasks.length > 0) {
        for (const t of pendingTasks.slice(0, 5)) {
          lines.push(`- ${t.title} (\`${t.id.slice(0, 8)}...\`)`);
        }
      } else {
        lines.push('_No tasks assigned to you._');
      }

      lines.push('', '## Recent Decisions');

      if (decisions.length > 0) {
        for (const d of decisions.slice(0, 5)) {
          lines.push(`- **${d.key}**: ${String(d.value).slice(0, 80)}`);
        }
      } else {
        lines.push('_No decisions recorded._');
      }

      lines.push('', '---', 'Use `is_my_turn` to check for available work.');

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // claim_todo
  server.tool(
    'claim_todo',
    'FOR SUB-AGENTS: Register yourself AND claim a specific task in one call. Use this when you were spawned to work on a specific todo. This creates the task if it doesn\'t exist, then claims it for you.',
    {
      title: z.string().describe('The title of the todo/task you were spawned to work on'),
      description: z.string().optional().default('').describe('Additional details about the task'),
      priority: z
        .enum(['low', 'normal', 'high', 'urgent'])
        .optional()
        .default('normal')
        .describe('Priority level'),
    },
    async ({ title, description, priority }) => {
      const db = getDatabase();

      // Generate agent name
      const agentName = `sub-${Date.now()}`;

      // Register as sub-agent
      const agent = db.createAgent({
        name: agentName,
        role: AgentRole.SUB,
        capabilities: ['code'],
        status: AgentStatus.BUSY, // Already working
      });
      setCurrentAgent(agent.id, agent.name);

      // Check if a task with this title already exists and is pending
      const allTasks = db.listTasks();
      let task = allTasks.find(
        (t) =>
          t.title.toLowerCase().trim() === title.toLowerCase().trim() &&
          ['pending', 'assigned'].includes(t.status)
      );

      if (task) {
        // Claim the existing task
        task = db.updateTask(task.id, {
          assignedTo: agent.id,
          status: TaskStatus.IN_PROGRESS,
        })!;
      } else {
        // Create a new task and claim it
        task = db.createTask({
          title,
          description,
          priority: priority as TaskPriority,
          status: TaskStatus.IN_PROGRESS,
          assignedTo: agent.id,
          createdBy: agent.id,
          startedAt: new Date(),
        });
      }

      // Sync context
      syncToActiveContext();

      const lines: string[] = [
        '# Task Claimed',
        '',
        `**You are**: ${agent.name} (\`${agent.id}\`)`,
        `**Working on**: ${task.title}`,
        `**Task ID**: \`${task.id}\``,
        '',
        '---',
        '',
        'Now you can start working. Remember to:',
        '1. `lock_acquire` on any files you edit',
        '2. `task_update` to report progress',
        '3. `task_complete` when done',
        '4. `agent_unregister` when finished',
      ];

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );
}
