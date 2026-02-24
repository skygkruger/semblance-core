import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { AppleNotesParser } from '@semblance/core/importers/notes/apple-notes-parser.js';
import { WhatsAppParser } from '@semblance/core/importers/messaging/whatsapp-parser.js';

describe('AppleNotesParser', () => {
  const parser = new AppleNotesParser();

  it('canParse returns true for HTML file with note structure', () => {
    const data = '<html><head><title>My Note</title></head><body><p>Content</p></body></html>';
    expect(parser.canParse('note.html', data)).toBe(true);
  });

  it('strips HTML and extracts plain text content', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'apple-notes-test-'));
    const html = `<html>
      <head><title>Shopping List</title></head>
      <body>
        <h1>Shopping List</h1>
        <ul>
          <li>Milk</li>
          <li>Bread</li>
          <li>Eggs</li>
        </ul>
        <p>Remember to check <b>expiry dates</b>.</p>
      </body>
    </html>`;
    writeFileSync(join(tmpDir, 'shopping.html'), html);

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    const content = result.items[0]!.content;
    expect(content).toContain('Milk');
    expect(content).toContain('Bread');
    expect(content).toContain('expiry dates');
    expect(content).not.toContain('<li>');
    expect(content).not.toContain('<b>');
  });

  it('extracts title from HTML heading', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'apple-notes-test-'));
    const html = '<html><head><title>Important Meeting Notes</title></head><body><p>Notes here</p></body></html>';
    writeFileSync(join(tmpDir, 'meeting.html'), html);

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Important Meeting Notes');
    expect(result.items[0]!.id).toMatch(/^anote_/);
  });
});

describe('WhatsAppParser', () => {
  const parser = new WhatsAppParser();

  it('canParse returns true for valid WhatsApp .txt format', () => {
    const data = '[15/01/2024, 10:30:00] Alice: Hello there!\n[15/01/2024, 10:31:00] Bob: Hi Alice!';
    expect(parser.canParse('WhatsApp Chat.txt', data)).toBe(true);
  });

  it('parses sender, timestamp, and message text correctly', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'wa-test-'));
    const chatContent = [
      '[15/01/2024, 10:30:00] Alice: Hello there!',
      '[15/01/2024, 10:31:00] Bob: Hi Alice, how are you?',
      '[15/01/2024, 10:32:00] Alice: Doing great, thanks!',
    ].join('\n');
    writeFileSync(join(tmpDir, 'chat.txt'), chatContent);

    const result = await parser.parse(join(tmpDir, 'chat.txt'));
    expect(result.format).toBe('whatsapp_txt');
    expect(result.items).toHaveLength(3);
    expect(result.items[0]!.metadata.sender).toBe('Alice');
    expect(result.items[0]!.content).toBe('Hello there!');
    expect(result.items[0]!.id).toMatch(/^wa_/);
    expect(result.items[1]!.metadata.sender).toBe('Bob');
    expect(result.items[1]!.content).toBe('Hi Alice, how are you?');
  });

  it('groups messages with correct conversation_id metadata', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'wa-test-'));
    const chatContent = [
      '[15/01/2024, 10:30:00] Alice: Message 1',
      '[15/01/2024, 10:31:00] Bob: Message 2',
    ].join('\n');
    writeFileSync(join(tmpDir, 'Team Chat.txt'), chatContent);

    const result = await parser.parse(join(tmpDir, 'Team Chat.txt'));
    expect(result.items).toHaveLength(2);

    // All messages in same file should share conversation_id
    const convId1 = result.items[0]!.metadata.conversation_id;
    const convId2 = result.items[1]!.metadata.conversation_id;
    expect(convId1).toBe(convId2);
    expect(convId1).toBeTruthy();

    // Message index should be sequential
    expect(result.items[0]!.metadata.message_index).toBe(0);
    expect(result.items[1]!.metadata.message_index).toBe(1);
  });
});
