// Email Types — Shared definitions for IMAP and SMTP adapters.

import { z } from 'zod';

export const EmailAddress = z.object({
  name: z.string(),
  address: z.string(),
});
export type EmailAddress = z.infer<typeof EmailAddress>;

export const EmailAttachment = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
});
export type EmailAttachment = z.infer<typeof EmailAttachment>;

export const EmailMessage = z.object({
  id: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  from: EmailAddress,
  to: z.array(EmailAddress),
  cc: z.array(EmailAddress),
  subject: z.string(),
  date: z.string(),
  body: z.object({
    text: z.string(),
    html: z.string().optional(),
  }),
  flags: z.array(z.string()),
  attachments: z.array(EmailAttachment),
});
export type EmailMessage = z.infer<typeof EmailMessage>;

// Small LLMs often serialize tool arguments as strings even when the schema
// wants numbers/booleans ("limit": "10", "unreadOnly": "true"). Use z.coerce
// so those get accepted cleanly instead of bubbling up as validator rejections.
export const EmailFetchParams = z.object({
  folder: z.string().default('INBOX'),
  limit: z.coerce.number().int().positive().default(50),
  since: z.string().optional(),
  search: z.string().optional(),
  messageIds: z.array(z.string()).optional(),
  unreadOnly: z.preprocess(
    v => (typeof v === 'string' ? v === 'true' : v),
    z.boolean().optional(),
  ),
  sort: z.string().optional(),
  // Multi-account overrides: when syncing a specific account, pass its token directly
  // so the adapter doesn't need to look up the primary account.
  accessTokenOverride: z.string().optional(),
  userEmailOverride: z.string().optional(),
});
export type EmailFetchParams = z.infer<typeof EmailFetchParams>;

// Coerce single string to array — 7B models often pass "to": "email" instead of ["email"]
const stringOrArray = z.union([z.string().transform(s => [s]), z.array(z.string())]);

export const EmailSendParams = z.object({
  to: stringOrArray,
  cc: z.union([z.string().transform(s => [s]), z.array(z.string())]).optional(),
  subject: z.string(),
  body: z.string(),
  replyToMessageId: z.string().optional(),
});
export type EmailSendParams = z.infer<typeof EmailSendParams>;

export const EmailDraftParams = EmailSendParams.extend({
  saveToDrafts: z.literal(true),
});
export type EmailDraftParams = z.infer<typeof EmailDraftParams>;
