/**
 * TodoistAdapter — Gateway service adapter for the Todoist API.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0).
 * Syncs active tasks via REST v2 and completed tasks via Sync v9.
 * User info is fetched from the Sync API (resource_types=["user"]).
 *
 * All HTTP calls use globalThis.fetch. No external HTTP libraries.
 */

import type { ActionType } from '@semblance/core';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import type { OAuthConfig } from '../oauth-config.js';
import type { AdapterResult } from '../base-oauth-adapter.js';
import type { ImportedItem } from '@semblance/core/importers/types.js';
import { BaseOAuthAdapter } from '../base-oauth-adapter.js';
import { oauthClients } from '../../config/oauth-clients.js';

const REST_API_BASE = 'https://api.todoist.com/rest/v2';
const SYNC_API_BASE = 'https://api.todoist.com/sync/v9';

/** Build the OAuthConfig for Todoist. */
export function getTodoistOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'todoist',
    authUrl: 'https://todoist.com/oauth/authorize',
    tokenUrl: 'https://todoist.com/oauth/access_token',
    scopes: 'data:read',
    usePKCE: false,
    clientId: oauthClients.todoist.clientId,
    clientSecret: oauthClients.todoist.clientSecret,
  };
}

interface TodoistTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  order: number;
  priority: number;
  labels: string[];
  due: {
    date: string;
    string: string;
    datetime: string | null;
    timezone: string | null;
    is_recurring: boolean;
  } | null;
  is_completed: boolean;
  created_at: string;
  url: string;
}

interface TodoistCompletedItem {
  id: string;
  task_id: string;
  content: string;
  project_id: string;
  completed_at: string;
}

interface TodoistCompletedResponse {
  items: TodoistCompletedItem[];
  has_more: boolean;
}

interface TodoistSyncResponse {
  user?: {
    id: number;
    full_name: string;
    email: string;
  };
}

interface TodoistProject {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export class TodoistAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getTodoistOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    // Use the Sync API to get user info
    const response = await globalThis.fetch(`${SYNC_API_BASE}/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        sync_token: '*',
        resource_types: '["user"]',
      }),
    });

    if (!response.ok) {
      throw new Error(`Todoist user info failed: HTTP ${response.status}`);
    }

    const data = await response.json() as TodoistSyncResponse;
    return {
      email: data.user?.email,
      displayName: data.user?.full_name,
    };
  }

  async execute(action: ActionType, payload: unknown): Promise<AdapterResult> {
    const p = payload as Record<string, unknown>;

    try {
      switch (action) {
        case 'connector.auth':
          return await this.performAuthFlow();

        case 'connector.auth_status':
          return this.handleAuthStatus();

        case 'connector.disconnect':
          return await this.performDisconnect();

        case 'connector.sync':
          return await this.handleSync(p);

        case 'connector.list_items':
          return await this.handleListItems(p);

        default:
          return {
            success: false,
            error: { code: 'UNKNOWN_ACTION', message: `TodoistAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'TODOIST_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync active tasks and completed tasks from Todoist.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 200;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch projects (for context)
    let projectMap: Map<string, string> = new Map();
    try {
      projectMap = await this.fetchProjectMap(accessToken);
    } catch (err) {
      errors.push({ message: `Projects: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch active tasks
    try {
      const activeTasks = await this.fetchActiveTasks(accessToken);
      for (const task of activeTasks) {
        if (items.length >= limit) break;
        items.push(this.taskToImportedItem(task, projectMap));
      }
    } catch (err) {
      errors.push({ message: `Active tasks: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 3. Fetch completed tasks
    try {
      const completedItems = await this.fetchCompletedTasks(accessToken, limit - items.length);
      for (const completed of completedItems) {
        if (items.length >= limit) break;
        items.push(this.completedTaskToImportedItem(completed, projectMap));
      }
    } catch (err) {
      errors.push({ message: `Completed tasks: ${err instanceof Error ? err.message : String(err)}` });
    }

    return {
      success: true,
      data: {
        items,
        totalItems: items.length,
        errors,
      },
    };
  }

  /**
   * List active tasks with pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const projectId = payload['projectId'] as string | undefined;

    const url = new URL(`${REST_API_BASE}/tasks`);
    if (projectId) {
      url.searchParams.set('project_id', projectId);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'TODOIST_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const tasks = await response.json() as TodoistTask[];

    // Fetch project names for context
    let projectMap: Map<string, string> = new Map();
    try {
      projectMap = await this.fetchProjectMap(accessToken);
    } catch {
      // Proceed without project names
    }

    const items = tasks.map((task) => this.taskToImportedItem(task, projectMap));

    return {
      success: true,
      data: {
        items,
        nextPageToken: null, // Todoist REST v2 doesn't use cursor pagination for tasks
      },
    };
  }

  private async fetchActiveTasks(accessToken: string): Promise<TodoistTask[]> {
    const response = await globalThis.fetch(`${REST_API_BASE}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json() as TodoistTask[];
  }

  private async fetchCompletedTasks(accessToken: string, limit: number): Promise<TodoistCompletedItem[]> {
    const url = new URL(`${SYNC_API_BASE}/completed/get_all`);
    url.searchParams.set('limit', String(Math.min(limit, 200)));

    const response = await globalThis.fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as TodoistCompletedResponse;
    return data.items;
  }

  private async fetchProjectMap(accessToken: string): Promise<Map<string, string>> {
    const response = await globalThis.fetch(`${REST_API_BASE}/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const projects = await response.json() as TodoistProject[];
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.id, project.name);
    }
    return map;
  }

  private taskToImportedItem(task: TodoistTask, projectMap: Map<string, string>): ImportedItem {
    const projectName = projectMap.get(task.project_id) ?? 'Unknown Project';
    const dueStr = task.due ? ` Due: ${task.due.string}.` : '';

    return {
      id: `tds_task_${task.id}`,
      sourceType: 'productivity' as const,
      title: task.content,
      content: `Task: "${task.content}"${task.description ? `. ${task.description}` : ''}. Project: ${projectName}. Priority: ${task.priority}.${dueStr}${task.labels.length > 0 ? ` Labels: ${task.labels.join(', ')}.` : ''}`,
      timestamp: task.created_at,
      metadata: {
        provider: 'todoist',
        type: 'task',
        taskId: task.id,
        projectId: task.project_id,
        projectName,
        priority: task.priority,
        labels: task.labels,
        due: task.due,
        isCompleted: task.is_completed,
        url: task.url,
        parentId: task.parent_id,
        sectionId: task.section_id,
      },
    };
  }

  private completedTaskToImportedItem(completed: TodoistCompletedItem, projectMap: Map<string, string>): ImportedItem {
    const projectName = projectMap.get(completed.project_id) ?? 'Unknown Project';

    return {
      id: `tds_done_${completed.task_id}`,
      sourceType: 'productivity' as const,
      title: `Completed: ${completed.content}`,
      content: `Completed task: "${completed.content}". Project: ${projectName}. Completed at: ${completed.completed_at}.`,
      timestamp: completed.completed_at,
      metadata: {
        provider: 'todoist',
        type: 'completed_task',
        taskId: completed.task_id,
        completedItemId: completed.id,
        projectId: completed.project_id,
        projectName,
        completedAt: completed.completed_at,
      },
    };
  }
}
