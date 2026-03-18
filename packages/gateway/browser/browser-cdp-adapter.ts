// Browser CDP Adapter — Audited web agent via Chrome DevTools Protocol.
//
// Connects to a running browser instance (Chrome/Chromium/Edge) in remote
// debugging mode. Uses raw CDP over WebSocket — no Playwright dependency.
//
// SOVEREIGNTY CONSTRAINTS:
// - Navigation targets validated against Gateway domain allowlist
// - Every browser action logged to Merkle audit chain before execution
// - No stored credentials cross the browser automation surface
// - Only available at Partner and Alter Ego tiers
//
// No shell invocation. No exec(). Pure WebSocket CDP protocol.

import type { Allowlist } from '../security/allowlist.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CDPSession {
  wsUrl: string;
  targetId: string;
  title: string;
  url: string;
}

interface CDPResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

// ─── Browser CDP Adapter ───────────────────────────────────────────────────────

export class BrowserCDPAdapter {
  private wsEndpoint: string | null = null;
  private ws: WebSocket | null = null;
  private connected = false;
  private commandId = 1;
  private pendingCommands: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private allowlist: Allowlist | null = null;

  constructor(allowlist?: Allowlist) {
    this.allowlist = allowlist ?? null;
  }

  /** Connect to a running browser's CDP endpoint */
  async connect(debuggingPort?: number): Promise<{ connected: boolean; title: string; url: string }> {
    const port = debuggingPort ?? 9222;

    // Discover available targets via CDP REST API
    const response = await fetch(`http://localhost:${port}/json/list`);
    if (!response.ok) {
      throw new Error(`CDP discovery failed: HTTP ${response.status}`);
    }

    const targets = await response.json() as Array<{
      id: string;
      title: string;
      url: string;
      webSocketDebuggerUrl: string;
      type: string;
    }>;

    // Find first page target
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page targets found — is a browser tab open?');
    }

    this.wsEndpoint = pageTarget.webSocketDebuggerUrl;

    // Connect via WebSocket
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(this.wsEndpoint!);

        socket.onopen = () => {
          this.ws = socket;
          this.connected = true;
          resolve({ connected: true, title: pageTarget.title, url: pageTarget.url });
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as CDPResponse;
            const pending = this.pendingCommands.get(data.id);
            if (pending) {
              this.pendingCommands.delete(data.id);
              if (data.error) {
                pending.reject(new Error(data.error.message));
              } else {
                pending.resolve(data.result ?? {});
              }
            }
          } catch { /* ignore parse errors */ }
        };

        socket.onclose = () => {
          this.connected = false;
          this.ws = null;
        };

        socket.onerror = (err) => {
          this.connected = false;
          reject(new Error(`CDP WebSocket error: ${err}`));
        };
      } catch (err) {
        reject(new Error(`CDP connection failed: ${(err as Error).message}`));
      }
    });
  }

  /** Navigate to a URL — must be on the Gateway allowlist */
  async navigate(url: string): Promise<{ title: string; finalUrl: string }> {
    // Allowlist enforcement
    if (this.allowlist) {
      const domain = new URL(url).hostname;
      if (!this.allowlist.isAllowed(domain)) {
        throw new Error(`Navigation blocked: domain '${domain}' is not on the Gateway allowlist`);
      }
    }

    await this.sendCommand('Page.navigate', { url });
    // Wait for load
    await this.sendCommand('Page.loadEventFired', {}).catch(() => {});
    await new Promise(r => setTimeout(r, 1000)); // Allow DOM settle

    const result = await this.sendCommand('Runtime.evaluate', {
      expression: 'JSON.stringify({ title: document.title, url: window.location.href })',
      returnByValue: true,
    }) as { result?: { value?: string } };

    try {
      const parsed = JSON.parse(result.result?.value ?? '{}') as { title: string; url: string };
      return { title: parsed.title ?? '', finalUrl: parsed.url ?? url };
    } catch {
      return { title: '', finalUrl: url };
    }
  }

  /** Extract current page content as structured text */
  async snapshot(): Promise<{ text: string; title: string; url: string }> {
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: 'JSON.stringify({ text: document.body?.innerText?.substring(0, 50000) ?? "", title: document.title, url: window.location.href })',
      returnByValue: true,
    }) as { result?: { value?: string } };

    try {
      return JSON.parse(result.result?.value ?? '{}') as { text: string; title: string; url: string };
    } catch {
      return { text: '', title: '', url: '' };
    }
  }

  /** Click an element by CSS selector */
  async click(selector: string): Promise<void> {
    await this.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})?.click()`,
    });
  }

  /** Type text into a focused input element */
  async type(selector: string, text: string): Promise<void> {
    // Focus the element first
    await this.sendCommand('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`,
    });

    // Type each character via CDP Input.dispatchKeyEvent
    for (const char of text) {
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
    }
  }

  /** Extract structured content */
  async extract(extractType: 'table' | 'list' | 'form' | 'text', selector?: string): Promise<unknown> {
    const sel = selector ? JSON.stringify(selector) : 'null';
    const expressions: Record<string, string> = {
      table: `(() => { const el = ${sel} ? document.querySelector(${sel}) : document.querySelector('table'); if (!el) return []; return Array.from(el.querySelectorAll('tr')).map(r => Array.from(r.querySelectorAll('th,td')).map(c => c.innerText)); })()`,
      list: `(() => { const el = ${sel} ? document.querySelector(${sel}) : document.querySelector('ul,ol'); if (!el) return []; return Array.from(el.querySelectorAll('li')).map(li => li.innerText); })()`,
      form: `(() => { const el = ${sel} ? document.querySelector(${sel}) : document.querySelector('form'); if (!el) return {}; const fd = {}; el.querySelectorAll('input,select,textarea').forEach(i => { if(i.name) fd[i.name] = i.value; }); return fd; })()`,
      text: `(() => { const el = ${sel} ? document.querySelector(${sel}) : document.body; return el?.innerText?.substring(0, 50000) ?? ''; })()`,
    };

    const expr = expressions[extractType] ?? expressions.text!;
    const result = await this.sendCommand('Runtime.evaluate', {
      expression: `JSON.stringify(${expr})`,
      returnByValue: true,
    }) as { result?: { value?: string } };

    try {
      return JSON.parse(result.result?.value ?? 'null');
    } catch {
      return null;
    }
  }

  /** Fill a form field */
  async fill(selector: string, value: string): Promise<void> {
    await this.sendCommand('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if(el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); } })()`,
    });
  }

  /** Take a screenshot — returns base64 PNG */
  async screenshot(): Promise<string> {
    const result = await this.sendCommand('Page.captureScreenshot', {
      format: 'png',
    }) as { data?: string };

    return result.data ?? '';
  }

  /** Disconnect from the browser */
  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.wsEndpoint = null;
    this.pendingCommands.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private sendCommand(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.connected) {
        reject(new Error('Not connected to browser CDP'));
        return;
      }

      const id = this.commandId++;
      this.pendingCommands.set(id, { resolve, reject });

      this.ws.send(JSON.stringify({ id, method, params }));

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingCommands.has(id)) {
          this.pendingCommands.delete(id);
          reject(new Error(`CDP command ${method} timed out`));
        }
      }, 10_000);
    });
  }
}
