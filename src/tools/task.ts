/**
 * Task management tools
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDatabase } from '../database.js';
import { TaskPriority, TaskStatus } from '../models.js';
import { getCurrentAgentId } from './agent.js';

export function registerTaskTools(server: McpServer): void {
  // task_create
  server.tool(
    'task_create',
    'Create a new task in the task queue.',
    {
      title: z.string().describe('Short title for the task'),
      description: z.string().optional().default('').describe('Detailed description'),
      priority: z
        .enum(['low', 'normal', 'high', 'urgent'])
        .optional()
        .default('normal')
        .describe('Priority level'),
      assigned_to: z.string().optional().describe('Agent ID to assign to'),
      dependencies: z
        .array(z.string())
        .optional()
        .default([])
        .describe('List of task IDs that must complete first'),
    },
    async ({ title, description, priority, assigned_to, dependencies }) => {
      const agentId = getCurrentAgentId();

      const task = getDatabase().createTask({
        title,
        description,
        priority: priority as TaskPriority,
        createdBy: agentId,
        assignedTo: assigned_to ?? null,
        dependencies,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Task created: '${task.title}' (\`${task.id}\`)`,
          },
        ],
      };
    }
  );

  // task_claim
  server.tool(
    'task_claim',
    'Claim a task to work on it. Sets status to in_progress.',
    {
      task_id: z
        .string()
        .optional()
        .describe('Task ID to claim. If omitted, claims the next available task.'),
    },
    async ({ task_id }) => {
      const agentId = getCurrentAgentId();
      if (!agentId) {
        return {
          content: [{ type: 'text', text: 'Error: Not registered.' }],
        };
      }

      const db = getDatabase();
      let task;

      if (task_id) {
        task = db.getTask(task_id);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task ${task_id} not found.` }],
          };
        }
      } else {
        task = db.getNextAvailableTask(agentId);
        if (!task) {
          return {
            content: [{ type: 'text', text: 'No available tasks to claim.' }],
          };
        }
      }

      // Check dependencies
      if (!db.checkDependenciesMet(task.id)) {
        return {
          content: [{ type: 'text', text: `Cannot claim: dependencies not met.` }],
        };
      }

      // Claim it
      const updated = db.updateTask(task.id, {
        status: TaskStatus.IN_PROGRESS,
        assignedTo: agentId,
      });

      if (updated) {
        return {
          content: [
            {
              type: 'text',
              text: `Claimed task: '${updated.title}' (\`${updated.id}\`)`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: 'Failed to claim task.' }],
      };
    }
  );

  // task_update
  server.tool(
    'task_update',
    'Update a task status or progress.',
    {
      task_id: z.string().describe('The task ID to update'),
      status: z
        .enum(['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('New status'),
      progress: z.number().min(0).max(100).optional().describe('Progress percentage (0-100)'),
      output: z.string().optional().describe('Output or notes'),
    },
    async ({ task_id, status, progress, output }) => {
      const db = getDatabase();
      const task = db.getTask(task_id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task ${task_id} not found.` }],
        };
      }

      const metadata = progress !== undefined ? { progress } : undefined;

      const updated = db.updateTask(task_id, {
        status: status as TaskStatus | undefined,
        output,
        metadata,
      });

      if (updated) {
        const statusInfo = status ? ` → ${status}` : '';
        const progressInfo = progress !== undefined ? ` (${progress}%)` : '';

        return {
          content: [
            {
              type: 'text',
              text: `Updated task '${updated.title}'${statusInfo}${progressInfo}`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: 'Failed to update task.' }],
      };
    }
  );

  // task_complete
  server.tool(
    'task_complete',
    'Mark a task as completed with optional output.',
    {
      task_id: z.string().describe('The task ID to complete'),
      output: z.string().optional().describe('Summary of what was done'),
    },
    async ({ task_id, output }) => {
      const db = getDatabase();
      const task = db.getTask(task_id);

      if (!task) {
        return {
          content: [{ type: 'text', text: `Task ${task_id} not found.` }],
        };
      }

      const updated = db.updateTask(task_id, {
        status: TaskStatus.COMPLETED,
        output,
      });

      if (updated) {
        return {
          content: [
            {
              type: 'text',
              text: `✅ Task completed: '${updated.title}'`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: 'Failed to complete task.' }],
      };
    }
  );

  // task_list
  server.tool(
    'task_list',
    'List tasks with optional filters.',
    {
      status: z
        .enum(['pending', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled'])
        .optional()
        .describe('Filter by status'),
      assigned_to: z.string().optional().describe('Filter by assigned agent ID'),
      mine: z.boolean().optional().describe('Show only my tasks'),
    },
    async ({ status, assigned_to, mine }) => {
      const agentId = getCurrentAgentId();
      const db = getDatabase();

      let assignee = assigned_to;
      if (mine && agentId) {
        assignee = agentId;
      }

      const tasks = db.listTasks({
        status: status as TaskStatus | undefined,
        assignedTo: assignee,
      });

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: 'No tasks found.' }],
        };
      }

      const lines = ['# Tasks\n'];

      for (const task of tasks) {
        const emoji = {
          pending: '⏳',
          assigned: '📋',
          in_progress: '🔄',
          completed: '✅',
          failed: '❌',
          cancelled: '🚫',
        }[task.status];

        lines.push(`${emoji} **${task.title}** (\`${task.id.slice(0, 8)}...\`)`);
        lines.push(`   Status: ${task.status} | Assigned: ${task.assignedTo || 'none'}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    }
  );

  // is_my_turn
  server.tool(
    'is_my_turn',
    "Check if it's your turn to work on a task or if work is available.",
    {
      task_id: z
        .string()
        .optional()
        .describe('Specific task ID, or leave empty to check for any available task'),
    },
    async ({ task_id }) => {
      const agentId = getCurrentAgentId();
      if (!agentId) {
        return {
          content: [{ type: 'text', text: 'Error: Not registered.' }],
        };
      }

      const db = getDatabase();

      if (task_id) {
        const task = db.getTask(task_id);
        if (!task) {
          return {
            content: [{ type: 'text', text: `Task ${task_id} not found.` }],
          };
        }

        if (task.assignedTo !== agentId) {
          return {
            content: [
              {
                type: 'text',
                text: `No - assigned to ${task.assignedTo || 'no one'}.`,
              },
            ],
          };
        }

        if (!db.checkDependenciesMet(task_id)) {
          return {
            content: [{ type: 'text', text: 'No - waiting for dependencies.' }],
          };
        }

        if (task.status === TaskStatus.COMPLETED) {
          return {
            content: [{ type: 'text', text: 'No - already completed.' }],
          };
        }

        return {
          content: [{ type: 'text', text: 'Yes - task is ready for you. Use task_claim to start.' }],
        };
      } else {
        const available = db.getNextAvailableTask(agentId);
        if (available) {
          return {
            content: [{ type: 'text', text: `Yes - '${available.title}' is available.` }],
          };
        }

        return {
          content: [{ type: 'text', text: 'No - no tasks available.' }],
        };
      }
    }
  );
}
