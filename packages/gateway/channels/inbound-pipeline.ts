// Inbound Message Pipeline — Sanitization + audit + routing for all channel messages.
//
// SOVEREIGNTY INVARIANT: Raw message content from external channels never crosses
// the IPC boundary unsanitized. Sanitization happens HERE in the Gateway.
// This is enforced structurally, not by convention.

import { sanitizeRetrievedContent } from '@semblance/core/agent/content-sanitizer.js';
import { sha256 } from '@semblance/core';
import type { AuditTrail } from '../audit/trail.js';
import type { InboundMessage } from './types.js';
import type { PairingManager } from './pairing-manager.js';

export interface InboundPipelineConfig {
  auditTrail: AuditTrail;
  pairingManager: PairingManager;
  /** Callback to forward sanitized message to Core orchestrator */
  onMessageForCore: (sanitizedMessage: SanitizedInboundMessage) => Promise<string>;
  /** Callback to send a reply back through the originating channel */
  onReplyReady?: (channelId: string, recipientId: string, content: string) => Promise<void>;
}

export interface SanitizedInboundMessage {
  channelId: string;
  senderId: string;
  senderDisplayName?: string;
  sanitizedContent: string;
  timestamp: string;
  sessionKey: string;
  threadId?: string;
}

/**
 * InboundPipeline processes all inbound channel messages with mandatory sanitization.
 */
export class InboundPipeline {
  private config: InboundPipelineConfig;

  constructor(config: InboundPipelineConfig) {
    this.config = config;
  }

  /**
   * Process an inbound message through the full pipeline:
   * 1. Sanitize content
   * 2. Log to audit chain
   * 3. Check sender approval
   * 4. If approved: forward to Core, get reply, dispatch back
   * 5. If not approved: send pairing code
   */
  async process(message: InboundMessage): Promise<void> {
    // Step 1: MANDATORY sanitization — no exceptions
    const sanitizedContent = sanitizeRetrievedContent(message.content);

    // Step 2: Log to audit chain (sanitized content hash, never raw)
    const payloadHash = sha256(sanitizedContent);
    this.config.auditTrail.append({
      requestId: `inbound-${message.channelId}-${Date.now()}`,
      timestamp: message.timestamp,
      action: 'message.inbound' as any,
      direction: 'request',
      status: 'success',
      payloadHash,
      signature: payloadHash,
      metadata: {
        channelId: message.channelId,
        senderId: message.senderId,
        senderDisplayName: message.senderDisplayName,
      },
    });

    // Step 3: Check sender approval
    const isApproved = this.config.pairingManager.isApproved(
      message.channelId,
      message.senderId,
    );

    if (!isApproved) {
      // Send pairing code — do NOT forward to Core
      const code = this.config.pairingManager.generateCode(
        message.channelId,
        message.senderId,
      );
      if (this.config.onReplyReady) {
        await this.config.onReplyReady(
          message.channelId,
          message.senderId,
          `Semblance requires pairing to chat. Enter this code in the app to approve: ${code}`,
        );
      }
      return;
    }

    // Step 4: Forward sanitized message to Core
    const sessionKey = `personal:${message.channelId}:main`;
    const sanitizedMsg: SanitizedInboundMessage = {
      channelId: message.channelId,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      sanitizedContent,
      timestamp: message.timestamp,
      sessionKey,
      threadId: message.threadId,
    };

    const reply = await this.config.onMessageForCore(sanitizedMsg);

    // Step 5: Dispatch reply back through originating channel
    if (reply && this.config.onReplyReady) {
      await this.config.onReplyReady(message.channelId, message.senderId, reply);
    }
  }
}
