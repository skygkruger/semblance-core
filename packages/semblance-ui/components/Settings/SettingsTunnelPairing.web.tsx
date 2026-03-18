import { useState, useEffect } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  platform: string;
  isOnline: boolean;
  lastSeen: string;
}

export function SettingsTunnelPairing({ onBack }: { onBack: () => void }) {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string>('');

  useEffect(() => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      invoke('ipc_send', { method: 'tunnel_list_paired_devices', params: {} })
        .then((result: PairedDevice[]) => {
          if (Array.isArray(result)) setDevices(result);
        })
        .catch(() => {});
    } catch { /* IPC unavailable */ }
  }, []);

  const handleShowQR = async () => {
    try {
      const { invoke } = require('@tauri-apps/api/core');
      const result = await invoke('ipc_send', { method: 'tunnel_generate_pairing_code', params: {} }) as { qr?: string; code?: string };
      if (result.qr) setQrCode(result.qr);
      if (result.code) setPairingCode(result.code);
    } catch { /* ignore */ }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Compute Mesh</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section-header">MESH STATUS</div>

        {devices.length === 0 ? (
          <div className="settings-card" style={{ margin: '0 16px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#EEF1F4', margin: '0 0 4px' }}>No devices paired yet</p>
            <p style={{ fontSize: 12, color: '#8593A4', margin: '0 0 12px', lineHeight: 1.4 }}>
              Pair your phone or another computer to enable remote inference and knowledge sync.
            </p>
            <button
              type="button"
              onClick={handleShowQR}
              style={{ background: 'none', border: '1px solid rgba(110,207,163,0.4)', color: '#6ECFA3', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}
            >
              Pair a device
            </button>
          </div>
        ) : (
          <>
            {devices.map(device => (
              <button key={device.deviceId} type="button" className="settings-row">
                <span className="settings-row__dot" style={{ background: device.isOnline ? '#6ECFA3' : '#5E6B7C' }} />
                <span className="settings-row__label">{device.deviceName}</span>
                <span className="settings-row__value" style={{ fontFamily: 'var(--fm)', textTransform: 'uppercase', fontSize: 10 }}>{device.platform}</span>
              </button>
            ))}
          </>
        )}

        <div className="settings-section-header">PAIR A NEW DEVICE</div>
        <div className="settings-card" style={{ margin: '0 16px 8px', textAlign: 'center' }}>
          {qrCode ? (
            <>
              <div style={{ padding: 16, background: '#fff', borderRadius: 8, display: 'inline-block', margin: '0 auto 12px' }}>
                <div style={{ width: 160, height: 160, background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#666' }}>
                  QR: {qrCode.substring(0, 20)}...
                </div>
              </div>
              {pairingCode && (
                <div style={{ fontFamily: 'var(--fm)', fontSize: 24, color: '#EEF1F4', letterSpacing: '0.2em', marginBottom: 8 }}>
                  {pairingCode}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#8593A4', fontFamily: 'var(--fm)' }}>Expires in 10 minutes</div>
            </>
          ) : (
            <button
              type="button"
              onClick={handleShowQR}
              style={{ background: 'none', border: '1px solid rgba(110,207,163,0.4)', color: '#6ECFA3', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13, width: '100%' }}
            >
              Show pairing QR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
