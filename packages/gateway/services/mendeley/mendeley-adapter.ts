/**
 * MendeleyAdapter — Gateway service adapter for the Mendeley API.
 *
 * Extends BaseOAuthAdapter (standard OAuth 2.0).
 * Syncs documents and annotations from the user's Mendeley library.
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

const API_BASE = 'https://api.mendeley.com';

/** Build the OAuthConfig for Mendeley. */
export function getMendeleyOAuthConfig(): OAuthConfig {
  return {
    providerKey: 'mendeley',
    authUrl: 'https://api.mendeley.com/oauth/authorize',
    tokenUrl: 'https://api.mendeley.com/oauth/token',
    scopes: 'all',
    usePKCE: false,
    clientId: oauthClients.mendeley.clientId,
    clientSecret: oauthClients.mendeley.clientSecret,
  };
}

interface MendeleyDocument {
  id: string;
  title: string;
  type: string;
  authors?: Array<{ first_name: string; last_name: string }>;
  year?: number;
  source?: string;
  abstract?: string;
  identifiers?: {
    doi?: string;
    isbn?: string;
    issn?: string;
    pmid?: string;
    arxiv?: string;
  };
  keywords?: string[];
  tags?: string[];
  created: string;
  last_modified: string;
  profile_id: string;
  read: boolean;
  starred: boolean;
  authored: boolean;
  file_attached: boolean;
  websites?: string[];
  notes?: string;
}

interface MendeleyAnnotation {
  id: string;
  type: string; // 'note' | 'highlight' | 'sticky_note'
  text?: string;
  document_id: string;
  created: string;
  last_modified: string;
  profile_id: string;
  positions?: Array<{
    top_left: { x: number; y: number };
    bottom_right: { x: number; y: number };
    page: number;
  }>;
  color?: { r: number; g: number; b: number };
}

interface MendeleyProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  institution?: string;
}

export class MendeleyAdapter extends BaseOAuthAdapter {
  constructor(tokenManager: OAuthTokenManager) {
    super(tokenManager, getMendeleyOAuthConfig());
  }

  protected async getUserInfo(accessToken: string): Promise<{ email?: string; displayName?: string }> {
    const response = await globalThis.fetch(`${API_BASE}/profiles/v2/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Mendeley user info failed: HTTP ${response.status}`);
    }

    const profile = await response.json() as MendeleyProfile;
    return {
      email: profile.email,
      displayName: profile.display_name,
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
            error: { code: 'UNKNOWN_ACTION', message: `MendeleyAdapter does not handle action: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'MENDELEY_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  /**
   * Sync documents and annotations from Mendeley.
   */
  private async handleSync(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const limit = (payload['limit'] as number) ?? 200;
    const items: ImportedItem[] = [];
    const errors: Array<{ message: string }> = [];

    // 1. Fetch documents (paginated)
    try {
      const docItems = await this.fetchDocuments(accessToken, limit);
      items.push(...docItems);
    } catch (err) {
      errors.push({ message: `Documents: ${err instanceof Error ? err.message : String(err)}` });
    }

    // 2. Fetch annotations (paginated)
    try {
      const annotationItems = await this.fetchAnnotations(accessToken, limit);
      items.push(...annotationItems);
    } catch (err) {
      errors.push({ message: `Annotations: ${err instanceof Error ? err.message : String(err)}` });
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
   * List documents with marker-based pagination.
   */
  private async handleListItems(payload: Record<string, unknown>): Promise<AdapterResult> {
    const accessToken = await this.getValidAccessToken();
    const pageSize = (payload['pageSize'] as number) ?? 50;
    const marker = payload['pageToken'] as string | undefined;

    const url = new URL(`${API_BASE}/documents`);
    url.searchParams.set('limit', String(Math.min(pageSize, 500)));
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'last_modified');
    url.searchParams.set('view', 'all');
    if (marker) {
      url.searchParams.set('marker', marker);
    }

    const response = await globalThis.fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.mendeley-document.1+json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: { code: 'MENDELEY_API_ERROR', message: `HTTP ${response.status}: ${response.statusText}` },
      };
    }

    const documents = await response.json() as MendeleyDocument[];
    const items = documents.map((doc) => this.documentToImportedItem(doc));

    // Mendeley uses Link header for pagination with marker
    const linkHeader = response.headers.get('Link');
    let nextMarker: string | null = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/marker=([^&>]+)/);
      if (nextMatch) {
        nextMarker = nextMatch[1]!;
      }
    }

    return {
      success: true,
      data: {
        items,
        nextPageToken: nextMarker,
      },
    };
  }

  private async fetchDocuments(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let marker: string | undefined;

    while (items.length < limit) {
      const url = new URL(`${API_BASE}/documents`);
      url.searchParams.set('limit', String(Math.min(limit - items.length, 500)));
      url.searchParams.set('order', 'desc');
      url.searchParams.set('sort', 'last_modified');
      url.searchParams.set('view', 'all');
      if (marker) {
        url.searchParams.set('marker', marker);
      }

      const response = await globalThis.fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.mendeley-document.1+json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const documents = await response.json() as MendeleyDocument[];

      if (documents.length === 0) break;

      for (const doc of documents) {
        if (items.length >= limit) break;
        items.push(this.documentToImportedItem(doc));
      }

      // Check Link header for next page marker
      const linkHeader = response.headers.get('Link');
      if (!linkHeader) break;

      const nextMatch = linkHeader.match(/marker=([^&>]+)/);
      if (!nextMatch) break;
      marker = nextMatch[1]!;
    }

    return items;
  }

  private async fetchAnnotations(accessToken: string, limit: number): Promise<ImportedItem[]> {
    const items: ImportedItem[] = [];
    let marker: string | undefined;

    while (items.length < limit) {
      const url = new URL(`${API_BASE}/annotations`);
      url.searchParams.set('limit', String(Math.min(limit - items.length, 200)));
      if (marker) {
        url.searchParams.set('marker', marker);
      }

      const response = await globalThis.fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.mendeley-annotation.1+json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const annotations = await response.json() as MendeleyAnnotation[];

      if (annotations.length === 0) break;

      for (const annotation of annotations) {
        if (items.length >= limit) break;
        items.push(this.annotationToImportedItem(annotation));
      }

      // Check Link header for next page marker
      const linkHeader = response.headers.get('Link');
      if (!linkHeader) break;

      const nextMatch = linkHeader.match(/marker=([^&>]+)/);
      if (!nextMatch) break;
      marker = nextMatch[1]!;
    }

    return items;
  }

  private documentToImportedItem(doc: MendeleyDocument): ImportedItem {
    const authors = doc.authors?.map(a => `${a.first_name} ${a.last_name}`).join(', ') ?? 'Unknown';
    const identifierStr = doc.identifiers?.doi ? ` DOI: ${doc.identifiers.doi}.` : '';

    return {
      id: `mnd_doc_${doc.id}`,
      sourceType: 'research' as const,
      title: doc.title,
      content: `"${doc.title}" by ${authors}.${doc.year ? ` (${doc.year}).` : ''}${doc.source ? ` In: ${doc.source}.` : ''}${identifierStr}${doc.abstract ? ` Abstract: ${doc.abstract.slice(0, 300)}${doc.abstract.length > 300 ? '...' : ''}` : ''}`,
      timestamp: doc.last_modified,
      metadata: {
        provider: 'mendeley',
        type: 'document',
        documentId: doc.id,
        docType: doc.type,
        authors: doc.authors?.map(a => `${a.first_name} ${a.last_name}`) ?? [],
        year: doc.year,
        source: doc.source,
        doi: doc.identifiers?.doi,
        isbn: doc.identifiers?.isbn,
        keywords: doc.keywords ?? [],
        tags: doc.tags ?? [],
        read: doc.read,
        starred: doc.starred,
        fileAttached: doc.file_attached,
        websites: doc.websites ?? [],
        createdAt: doc.created,
      },
    };
  }

  private annotationToImportedItem(annotation: MendeleyAnnotation): ImportedItem {
    const titleText = annotation.text
      ? annotation.text.slice(0, 80) + (annotation.text.length > 80 ? '...' : '')
      : `${annotation.type} annotation`;

    return {
      id: `mnd_ann_${annotation.id}`,
      sourceType: 'research' as const,
      title: titleText,
      content: annotation.text ?? `${annotation.type} annotation on document ${annotation.document_id}`,
      timestamp: annotation.last_modified,
      metadata: {
        provider: 'mendeley',
        type: 'annotation',
        annotationId: annotation.id,
        annotationType: annotation.type,
        documentId: annotation.document_id,
        color: annotation.color,
        positions: annotation.positions,
        createdAt: annotation.created,
      },
    };
  }
}
