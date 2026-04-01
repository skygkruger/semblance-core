// API Key Validator — Validates Cloud Bridge API keys with a lightweight test call.
//
// Each provider has a validation endpoint (typically list-models or a minimal
// chat completion). The validator makes a single request to confirm the key works.
//
// This file is in packages/gateway/. Network access is permitted here.

import type { KnownProviderConfig, CloudBridgeModel } from '@semblance/core';
import { getKnownProvider } from '@semblance/core';

export interface ValidationResult {
  valid: boolean;
  providerId: string;
  models: CloudBridgeModel[];
  error?: string;
}

/**
 * Validate an API key for a known provider by making a lightweight test call.
 */
export async function validateApiKey(
  providerId: string,
  apiKey: string,
  customBaseUrl?: string,
): Promise<ValidationResult> {
  const config = getKnownProvider(providerId);

  if (config) {
    return validateKnownProvider(config, apiKey);
  }

  // Custom OpenAI-compatible endpoint
  if (customBaseUrl) {
    return validateOpenAICompatible(providerId, apiKey, customBaseUrl);
  }

  return { valid: false, providerId, models: [], error: `Unknown provider: ${providerId}` };
}

// ─── Known Provider Validators ────────────────────────────────────────────────

async function validateKnownProvider(
  config: KnownProviderConfig,
  apiKey: string,
): Promise<ValidationResult> {
  switch (config.id) {
    case 'anthropic':
      return validateAnthropic(config, apiKey);
    case 'openai':
      return validateOpenAI(config, apiKey);
    case 'google':
      return validateGoogle(config, apiKey);
    default:
      return validateOpenAICompatible(config.id, apiKey, config.baseUrl);
  }
}

async function validateAnthropic(
  config: KnownProviderConfig,
  apiKey: string,
): Promise<ValidationResult> {
  try {
    // Use the messages endpoint with a minimal request to validate
    const response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok || response.status === 200) {
      return { valid: true, providerId: config.id, models: config.models };
    }

    // 401 = invalid key, anything else might be a transient error
    if (response.status === 401) {
      return { valid: false, providerId: config.id, models: [], error: 'Invalid API key' };
    }

    // 429 = rate limited but key is valid
    if (response.status === 429) {
      return { valid: true, providerId: config.id, models: config.models };
    }

    const errorBody = await response.text().catch(() => '');
    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Validation failed (HTTP ${response.status}): ${errorBody.slice(0, 200)}`,
    };
  } catch (error) {
    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}

async function validateOpenAI(
  config: KnownProviderConfig,
  apiKey: string,
): Promise<ValidationResult> {
  try {
    // Use the models endpoint to validate the key
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      return { valid: true, providerId: config.id, models: config.models };
    }

    if (response.status === 401) {
      return { valid: false, providerId: config.id, models: [], error: 'Invalid API key' };
    }

    if (response.status === 429) {
      return { valid: true, providerId: config.id, models: config.models };
    }

    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Validation failed (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}

async function validateGoogle(
  config: KnownProviderConfig,
  apiKey: string,
): Promise<ValidationResult> {
  try {
    // Use the models endpoint to validate
    const response = await fetch(
      `${config.baseUrl}/v1beta/models?key=${apiKey}`,
    );

    if (response.ok) {
      return { valid: true, providerId: config.id, models: config.models };
    }

    if (response.status === 400 || response.status === 403) {
      return { valid: false, providerId: config.id, models: [], error: 'Invalid API key' };
    }

    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Validation failed (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      valid: false,
      providerId: config.id,
      models: [],
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}

async function validateOpenAICompatible(
  providerId: string,
  apiKey: string,
  baseUrl: string,
): Promise<ValidationResult> {
  try {
    // OpenAI-compatible endpoints should support /v1/models
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.ok) {
      // Try to extract model list from response
      const data = await response.json().catch(() => ({ data: [] })) as {
        data?: Array<{ id: string }>;
      };
      const models: CloudBridgeModel[] = (data.data ?? []).slice(0, 20).map((m: { id: string }) => ({
        id: m.id,
        provider: providerId,
        displayName: m.id,
        contextWindow: 8192, // Unknown — use conservative default
        supportsStreaming: true,
        supportsTools: false, // Unknown
        costPerInputToken: null,
        costPerOutputToken: null,
      }));

      return { valid: true, providerId, models };
    }

    if (response.status === 401 || response.status === 403) {
      return { valid: false, providerId, models: [], error: 'Invalid API key' };
    }

    return {
      valid: false,
      providerId,
      models: [],
      error: `Validation failed (HTTP ${response.status})`,
    };
  } catch (error) {
    return {
      valid: false,
      providerId,
      models: [],
      error: `Connection failed: ${(error as Error).message}`,
    };
  }
}
