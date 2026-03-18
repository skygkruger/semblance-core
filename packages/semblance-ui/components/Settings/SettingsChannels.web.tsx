import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface ChannelInfo {
  channelId: string;
  displayName: string;
  running: boolean;
  connected: boolean;
  messageCount: number;
  lastMessageAt?: string;
  errorMessage?: string;
}

export function SettingsChannels({ onBack }: { onBack: () => void }) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    // Fetch channel list via IPC
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'channel_list', params: {} })
        .then((result: ChannelInfo[]) => {
          if (Array.isArray(result)) setChannels(result);
        })
        .catch(() => {
          // Provide default channel list if IPC unavailable
          setChannels([
            { channelId: 'imessage', displayName: 'iMessage', running: false, connected: false, messageCount: 0 },
            { channelId: 'telegram', displayName: 'Telegram', running: false, connected: false, messageCount: 0 },
            { channelId: 'signal', displayName: 'Signal', running: false, connected: false, messageCount: 0, errorMessage: 'Requires signal-cli' },
            { channelId: 'slack', displayName: 'Slack', running: false, connected: false, messageCount: 0 },
            { channelId: 'whatsapp', displayName: 'WhatsApp', running: false, connected: false, messageCount: 0 },
          ]);
        });
    } catch {
      setChannels([
        { channelId: 'imessage', displayName: 'iMessage', running: false, connected: false, messageCount: 0 },
        { channelId: 'telegram', displayName: 'Telegram', running: false, connected: false, messageCount: 0 },
        { channelId: 'signal', displayName: 'Signal', running: false, connected: false, messageCount: 0, errorMessage: 'Requires signal-cli' },
        { channelId: 'slack', displayName: 'Slack', running: false, connected: false, messageCount: 0 },
        { channelId: 'whatsapp', displayName: 'WhatsApp', running: false, connected: false, messageCount: 0 },
      ]);
    }
  }, []);

  const connected = channels.filter(c => c.connected);
  const disconnected = channels.filter(c => !c.connected);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Messaging Channels</h1>
      </div>

      <div className="settings-content">
        {connected.length > 0 && (
          <>
            <div className="settings-section-header">CONNECTED</div>
            {connected.map(ch => (
              <button key={ch.channelId} type="button" className="settings-row" onClick={() => setExpanded(expanded === ch.channelId ? null : ch.channelId)}>
                <span className="settings-row__dot settings-row__dot--connected" />
                <span className="settings-row__label">{ch.displayName}</span>
                <span className="settings-row__value">{ch.messageCount} messages</span>
              </button>
            ))}
          </>
        )}

        <div className="settings-section-header">CONFIGURE</div>
        {disconnected.map(ch => (
          <div key={ch.channelId}>
            <button type="button" className="settings-row" onClick={() => setExpanded(expanded === ch.channelId ? null : ch.channelId)}>
              <span className="settings-row__dot" />
              <span className="settings-row__label">{ch.displayName}</span>
              <span className="settings-row__value">{ch.errorMessage ?? 'Not configured'}</span>
            </button>
            {expanded === ch.channelId && (
              <div className="settings-card" style={{ margin: '0 16px 8px' }}>
                <p style={{ fontSize: 13, color: '#A8B4C0', margin: 0 }}>
                  {ch.channelId === 'signal' && 'Requires signal-cli installed on your system. Visit github.com/AsamK/signal-cli for installation.'}
                  {ch.channelId === 'slack' && 'Add your Slack Bot Token (xoxb-) and App Token (xapp-) from your Slack app configuration.'}
                  {ch.channelId === 'whatsapp' && 'Scan a QR code from your WhatsApp mobile app to link this device.'}
                  {ch.channelId === 'telegram' && 'Enter your Telegram Bot token from @BotFather.'}
                  {ch.channelId === 'imessage' && 'Requires BlueBubbles running on this Mac. Visit bluebubbles.app for setup.'}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
