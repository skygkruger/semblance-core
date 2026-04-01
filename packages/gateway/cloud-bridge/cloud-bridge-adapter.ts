// Cloud Bridge Adapter — Makes inference requests to cloud AI providers.
//
// This adapter sits in the Gateway and handles the actual HTTP calls to
// Anthropic, OpenAI, Google, and OpenAI-compatible endpoints. The AI Core
// NEVER calls this directly — requests flow through IPC.
//
// All requests are:
//   1. Validated against the routing policy
//   2. Checked against content exclusion rules
//   3. Logged to the Merkle audit chain BEFORE execution
//   4. Logged with response metadata AFTER execution
//
// This file is in packages/gateway/. Network access is permitted here.

import type {
  CloudBridgeRequest,
  CloudBridgeResponse,
  KnownProviderConfig,
} from '@semblance/core';
import { getKnownProvider } from '@semblance/core';

export interface CloudBridgeAdapterConfig {
  /** Function to retrieve API key from credential store */
  getApiKey: (providerId: string) => Promise<string | null>;
  /** Custom base URL for non-standard providers */
  getBaseUrl?: (providerId: string) => string | null;
}

/**
 * CloudBridgeAdapter — Executes inference requests against cloud AI providers.
 */
export class CloudBridgeAdapter {
  private getApiKey: (providerId: string) => Promise<string | null>;
  private getBaseUrl: (providerId: string) => string | null;

  constructor(config: CloudBridgeAdapterConfig) {
    this.getApiKey = config.getApiKey;
    this.getBaseUrl = config.getBaseUrl ?? (() => null);
  }

  /**
   * Execute a Cloud Bridge inference request.
   *
   * Routes to the appropriate provider's API based on the request's provider field.
   * Returns a normalized response regardless of which provider handled it.
   */
  async execute(request: CloudBridgeRequest): Promise<CloudBridgeResponse> {
    const apiKey = await this.getApiKey(request.provider);
    if (!apiKey) {
      throw new Error(`No API key available for provider: ${request.provider}`);
    }

    const knownConfig = getKnownProvider(request.provider);
    const startTime = Date.now();

    let response: CloudBridgeResponse;
    if (knownConfig) {
      switch (knownConfig.id) {
        case 'anthropic':
          response = await this.callAnthropic(knownConfig, apiKey, request);
          break;
        case 'openai':
          response = await this.callOpenAI(knownConfig, apiKey, request);
          break;
        case 'google':
          response = await this.callGoogle(knownConfig, apiKey, request);
          break;
        default:
          response = await this.callOpenAICompatible(
            knownConfig.baseUrl,
            apiKey,
            request,
          );
      }
    } else {
      // Custom endpoint
      const baseUrl = this.getBaseUrl(request.provider);
      if (!baseUrl) {
        throw new Error(`No base URL configured for custom provider: ${request.provider}`);
      }
      response = await this.callOpenAICompatible(baseUrl, apiKey, request);
    }

    response.durationMs = Date.now() - startTime;
    return response;
  }

  // ─── Provider-Specific Call Methods ─────────────────────────────────────

  private async callAnthropic(
    config: KnownProviderConfig,
    apiKey: string,
    request: CloudBridgeRequest,
  ): Promise<CloudBridgeResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: request.messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      temperature: request.temperature,
    };

    // Anthropic uses a separate system parameter
    const systemMsg = request.messages.find(m => m.role === 'system');
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    // Add tools if present
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch(`${config.baseUrl}${config.chatEndpoint}`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Anthropic API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
      model?: string;
    };

    const textContent = data.content?.find(c => c.type === 'text')?.text ?? '';
    const tokensIn = data.usage?.input_tokens ?? 0;
    const tokensOut = data.usage?.output_tokens ?? 0;

    return {
      requestId: request.id,
      provider: request.provider,
      model: data.model ?? request.model,
      message: { role: 'assistant', content: textContent },
      tokensUsed: { prompt: tokensIn, completion: tokensOut, total: tokensIn + tokensOut },
      durationMs: 0,
      cached: false,
    };
  }

  private async callOpenAI(
    config: KnownProviderConfig,
    apiKey: string,
    request: CloudBridgeRequest,
  ): Promise<CloudBridgeResponse> {
    return this.callOpenAICompatible(config.baseUrl, apiKey, request);
  }

  private async callOpenAICompatible(
    baseUrl: string,
    apiKey: string,
    request: CloudBridgeRequest,
  ): Promise<CloudBridgeResponse> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI-compatible API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { role?: string; content?: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      model?: string;
    };

    const choice = data.choices?.[0];
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;

    return {
      requestId: request.id,
      provider: request.provider,
      model: data.model ?? request.model,
      message: {
        role: 'assistant',
        content: choice?.message?.content ?? '',
      },
      tokensUsed: { prompt: tokensIn, completion: tokensOut, total: tokensIn + tokensOut },
      durationMs: 0,
      cached: false,
    };
  }

  private async callGoogle(
    config: KnownProviderConfig,
    apiKey: string,
    request: CloudBridgeRequest,
  ): Promise<CloudBridgeResponse> {
    // Google uses a different API structure
    const contents = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      },
    };

    // System instruction
    const systemMsg = request.messages.find(m => m.role === 'system');
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    const endpoint = config.chatEndpoint.replace('{model}', request.model);
    const response = await fetch(
      `${config.baseUrl}${endpoint}?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Google AI API error (${response.status}): ${errorText.slice(0, 500)}`);
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
    };

    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const tokensIn = data.usageMetadata?.promptTokenCount ?? 0;
    const tokensOut = data.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      requestId: request.id,
      provider: request.provider,
      model: request.model,
      message: { role: 'assistant', content: textContent },
      tokensUsed: { prompt: tokensIn, completion: tokensOut, total: tokensIn + tokensOut },
      durationMs: 0,
      cached: false,
    };
  }
}
