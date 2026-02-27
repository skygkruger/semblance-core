import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import { LogoMark } from '../LogoMark/LogoMark';
import { Wordmark } from '../Wordmark/Wordmark';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { PrivacyBadge } from '../PrivacyBadge/PrivacyBadge';
import '../../pages/Onboarding/Onboarding.css';

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: 'var(--base)',
    overflow: 'hidden',
  }}>
    <DotMatrix />
    <div style={{
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 40,
    }}>
      {children}
    </div>
  </div>
);

const meta: Meta = {
  title: 'Pages/Onboarding',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

export const SplashScreen: Story = {
  render: () => (
    <PageWrapper>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        animation: 'dissolve 700ms var(--eo) both',
      }}>
        <LogoMark size={200} />
        <Wordmark size="hero" />
        <p style={{
          fontFamily: 'var(--fd)',
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 'var(--text-lg)',
          color: 'var(--sv2)',
          textAlign: 'center',
          maxWidth: 440,
        }}>
          Your intelligence. Your device. Your rules.
        </p>
        <div style={{ marginTop: 32 }}>
          <Button variant="approve" size="lg">Begin Setup</Button>
        </div>
      </div>
    </PageWrapper>
  ),
};

export const HardwareDetection: Story = {
  render: () => (
    <PageWrapper>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        maxWidth: 480,
        animation: 'dissolve 700ms var(--eo) both',
      }}>
        <h2 style={{
          fontFamily: 'var(--fd)',
          fontWeight: 300,
          fontSize: 'var(--text-2xl)',
          color: 'var(--white)',
          textAlign: 'center',
          margin: 0,
        }}>
          Checking your hardware
        </h2>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          width: '100%',
          marginTop: 16,
        }}>
          {[
            { label: 'CPU', value: 'Apple M2 Pro', ok: true },
            { label: 'RAM', value: '16 GB', ok: true },
            { label: 'Storage', value: '247 GB free', ok: true },
            { label: 'Model', value: 'Llama 3.2 3B Q4 ready', ok: true },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--s1)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--b1)',
              animation: `dissolve 700ms var(--eo) both`,
              animationDelay: `${i * 80}ms`,
            }}>
              <span style={{ fontFamily: 'var(--fm)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sv1)' }}>
                {item.label}
              </span>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: item.ok ? 'var(--v)' : 'var(--rust)' }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button variant="approve" size="md">Continue</Button>
        </div>
      </div>
    </PageWrapper>
  ),
};

export const DataSources: Story = {
  render: () => (
    <PageWrapper>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        maxWidth: 520,
        animation: 'dissolve 700ms var(--eo) both',
      }}>
        <h2 style={{
          fontFamily: 'var(--fd)',
          fontWeight: 300,
          fontSize: 'var(--text-2xl)',
          color: 'var(--white)',
          textAlign: 'center',
          margin: 0,
        }}>
          Connect your world
        </h2>
        <p style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-base)', color: 'var(--sv3)', textAlign: 'center' }}>
          Everything stays on this device. Semblance connects to your accounts through the Gateway, fetches your data, and stores it locally.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 8 }}>
          {['Email (Gmail)', 'Calendar', 'Contacts', 'Files (iCloud)', 'Bank (Plaid)', 'Health (Apple Health)'].map((source, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--s1)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--b1)',
              animation: `dissolve 700ms var(--eo) both`,
              animationDelay: `${i * 80}ms`,
            }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-base)', color: 'var(--sv3)' }}>{source}</span>
              <Button variant="ghost" size="sm">Connect</Button>
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  ),
};

export const AutonomyTier: Story = {
  render: () => (
    <PageWrapper>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        maxWidth: 560,
        animation: 'dissolve 700ms var(--eo) both',
      }}>
        <h2 style={{
          fontFamily: 'var(--fd)',
          fontWeight: 300,
          fontSize: 'var(--text-2xl)',
          color: 'var(--white)',
          textAlign: 'center',
          margin: 0,
        }}>
          How much should Semblance do on its own?
        </h2>
        {[
          { name: 'Guardian', desc: 'Shows everything, asks before acting. You approve every action.', recommended: false },
          { name: 'Partner', desc: 'Handles routine tasks autonomously. Asks for anything new or high-stakes.', recommended: true },
          { name: 'Alter Ego', desc: 'Acts as you for nearly everything. Only interrupts for genuinely critical decisions.', recommended: false },
        ].map((tier, i) => (
          <div key={i} style={{
            width: '100%',
            padding: '20px 24px',
            background: tier.recommended ? 'var(--s2)' : 'var(--s1)',
            borderRadius: 'var(--r-lg)',
            border: `1px solid ${tier.recommended ? 'var(--v-wire)' : 'var(--b1)'}`,
            cursor: 'pointer',
            animation: `dissolve 700ms var(--eo) both`,
            animationDelay: `${i * 80}ms`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-lg)', fontWeight: 400, color: 'var(--w-dim)' }}>
                {tier.name}
              </span>
              {tier.recommended && (
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--v)',
                  background: 'var(--v-dim)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-sm)',
                }}>
                  Recommended
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: 'var(--sv3)', marginTop: 6 }}>
              {tier.desc}
            </p>
          </div>
        ))}
      </div>
    </PageWrapper>
  ),
};

const NamingMomentScreen = ({ defaultValue = '' }: { defaultValue?: string }) => {
  const [name, setName] = useState(defaultValue);
  const hasValue = name.trim().length > 0;

  return (
    <PageWrapper>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        maxWidth: 420,
        width: '100%',
        animation: 'dissolve 700ms var(--eo) both',
      }}>
        <LogoMark size={80} />
        <h1 className="naming__headline">
          What should it call{' '}
          <em className="naming__pronoun">you</em>
          ?
        </h1>
        <p className="naming__subtext">
          Stored only on your device. Never transmitted.
        </p>
        <div style={{ width: '100%' }}>
          <Input
            placeholder="Your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <PrivacyBadge status="active" />
        <div style={{ marginTop: 8 }}>
          <Button variant="approve" size="lg" disabled={!hasValue}>Continue</Button>
        </div>
      </div>
    </PageWrapper>
  );
};

export const NamingMoment: Story = {
  render: () => <NamingMomentScreen />,
};

export const NamingMomentFilled: Story = {
  render: () => <NamingMomentScreen defaultValue="Sky" />,
};
