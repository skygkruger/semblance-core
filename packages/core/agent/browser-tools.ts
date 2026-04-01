// Browser CDP Tool Definitions — Registers browser automation tools with the orchestrator
// so the coordinator can assign them to subagents for web research and form filling.
//
// The actual execution happens via IPC to the Gateway's BrowserCDPAdapter.
// These definitions make the tools visible to the LLM during planning and execution.
//
// CRITICAL: This file is in packages/core/. No network imports. Tool definitions only.

import type { ToolDefinition } from '../llm/types.js';
import type { ActionType } from '../types/ipc.js';

// ─── Browser Tool Definitions ─────────────────────────────────────────────────

export const BROWSER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'browser_connect',
    description: 'Connect to a running Chrome/Edge browser in remote debugging mode. Must be called before other browser tools. The browser must be launched with --remote-debugging-port=9222.',
    parameters: {
      type: 'object',
      properties: {
        debuggingPort: { type: 'number', description: 'Chrome DevTools debugging port (default 9222)' },
      },
    },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the browser to a URL. The URL must be on the user\'s domain allowlist. Returns the page title and final URL after any redirects.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Extract the current page content as text. Returns the page title, URL, and full text content. Useful for reading web pages without navigating away.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page identified by a CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the element to click' },
      },
      required: ['selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field identified by a CSS selector.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the input element' },
        text: { type: 'string', description: 'Text to type into the field' },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'browser_fill',
    description: 'Fill a form field with a value (sets the value directly without typing). Useful for dropdowns, date pickers, and other non-text inputs.',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the form element' },
        value: { type: 'string', description: 'Value to set' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'browser_extract',
    description: 'Extract structured data from the page. Can extract tables, lists, forms, or text from a specific area.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['table', 'list', 'form', 'text'], description: 'Type of data to extract' },
        selector: { type: 'string', description: 'CSS selector to scope extraction (optional — defaults to entire page)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current page. Returns a base64-encoded PNG image.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'browser_disconnect',
    description: 'Disconnect from the browser. Call when done with browser automation.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Browser Tool Action Map ──────────────────────────────────────────────────

/** Maps browser tool names to IPC action types for Gateway routing. */
export const BROWSER_TOOL_ACTION_MAP: Record<string, ActionType> = {
  'browser_connect': 'browser.connect' as ActionType,
  'browser_navigate': 'browser.navigate' as ActionType,
  'browser_snapshot': 'browser.snapshot' as ActionType,
  'browser_click': 'browser.click' as ActionType,
  'browser_type': 'browser.type' as ActionType,
  'browser_fill': 'browser.fill' as ActionType,
  'browser_extract': 'browser.extract' as ActionType,
  'browser_screenshot': 'browser.screenshot' as ActionType,
  'browser_disconnect': 'browser.disconnect' as ActionType,
};

/** All browser tool names. */
export const BROWSER_TOOL_NAMES = BROWSER_TOOL_DEFINITIONS.map(t => t.name);
