import type { Meta, StoryObj } from '@storybook/react';
import { colors } from '../tokens/colors';
import { fontSize, fontFamily, fontWeight } from '../tokens/typography';
import { spacing } from '../tokens/spacing';
import { shadows, borderRadius } from '../tokens/shadows';

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          backgroundColor: value,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#ECEDF0' }}>{name}</div>
        <div style={{ fontSize: 12, color: '#9BA0B0' }}>{value}</div>
      </div>
    </div>
  );
}

function DesignTokenShowcase() {
  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: '#ECEDF0', marginBottom: 32 }}>
        Semblance Design Tokens
      </h1>

      {/* Colors */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#ECEDF0', marginBottom: 16 }}>Colors</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {Object.entries(colors).map(([name, value]) => (
            <ColorSwatch key={name} name={name} value={value} />
          ))}
        </div>
      </section>

      {/* Typography */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#ECEDF0', marginBottom: 16 }}>Typography Scale</h2>
        {Object.entries(fontSize).map(([name, size]) => (
          <div key={name} style={{ marginBottom: 12 }}>
            <span style={{ fontSize: size, color: '#ECEDF0', fontFamily: fontFamily.ui }}>
              {name} — {size}
            </span>
          </div>
        ))}
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ECEDF0', marginBottom: 8 }}>Font Families</h3>
          {Object.entries(fontFamily).map(([name, family]) => (
            <div key={name} style={{ fontSize: 16, color: '#9BA0B0', fontFamily: family, marginBottom: 8 }}>
              {name}: {family}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#ECEDF0', marginBottom: 8 }}>Font Weights</h3>
          {Object.entries(fontWeight).map(([name, weight]) => (
            <div key={name} style={{ fontSize: 16, fontWeight: weight, color: '#ECEDF0', marginBottom: 8 }}>
              {name} ({weight})
            </div>
          ))}
        </div>
      </section>

      {/* Spacing */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#ECEDF0', marginBottom: 16 }}>Spacing Scale</h2>
        {Object.entries(spacing).map(([name, value]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ width: 60, fontSize: 13, color: '#9BA0B0', textAlign: 'right' }}>
              {name} ({value})
            </span>
            <div style={{ height: 16, width: value, backgroundColor: '#4A7FBA', borderRadius: 2 }} />
          </div>
        ))}
      </section>

      {/* Shadows */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#ECEDF0', marginBottom: 16 }}>Shadows</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(shadows).map(([name, value]) => (
            <div
              key={name}
              style={{
                width: 120,
                height: 120,
                backgroundColor: '#222538',
                borderRadius: 12,
                boxShadow: value,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                color: '#9BA0B0',
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </section>

      {/* Border Radius */}
      <section>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: '#ECEDF0', marginBottom: 16 }}>Border Radius</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {Object.entries(borderRadius).map(([name, value]) => (
            <div
              key={name}
              style={{
                width: 80,
                height: 80,
                backgroundColor: '#4A7FBA',
                borderRadius: value,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: '#fff',
                fontWeight: 600,
              }}
            >
              {name}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: 'Design Tokens',
  component: DesignTokenShowcase,
};

export default meta;

type Story = StoryObj;

export const AllTokens: Story = {};
