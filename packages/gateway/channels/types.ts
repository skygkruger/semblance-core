// Channel Adapter Types — Contract for all messaging channel adapters.
// All inbound messages are sanitized in the Gateway before crossing the IPC boundary.

export interface ChannelAdapter {
  readonly channelId: string;
  readonly displayName: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  getStatus(): ChannelStatus;
  isRunning(): boolean;
}

export interface InboundMessage {
  channelId: string;
  senderId: string;
  senderDisplayName?: string;
  content: string;
  timestamp: string;
  threadId?: string;
  attachments?: MessageAttachment[];
}

export interface OutboundMessage {
  channelId: string;
  recipientId: string;
  content: string;
  replyToId?: string;
}

export interface MessageAttachment {
  type: 'image' | 'file' | 'audio' | 'video';
  filename: string;
  mimeType: string;
  sizeByes: number;
  localPath?: string;
}

export interface ChannelStatus {
  running: boolean;
  connected: boolean;
  errorMessage?: string;
  lastMessageAt?: string;
  messageCount: number;
}
