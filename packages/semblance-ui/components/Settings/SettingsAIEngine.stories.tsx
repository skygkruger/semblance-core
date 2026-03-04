import type { Meta, StoryObj } from '@storybook/react';
import { SettingsAIEngine } from './SettingsAIEngine';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SettingsAIEngine> = {
  title: 'Settings/SettingsAIEngine',
  component: SettingsAIEngine,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsAIEngine>;

export const ModelRunning: Story = {
  args: {
    modelName: 'llama3.2:3b',
    modelSize: '3.2B parameters · 2.1 GB',
    hardwareProfile: 'Apple M3 Pro · 18GB unified memory',
    isModelRunning: true,
    inferenceThreads: 'auto',
    contextWindow: 8192,
    gpuAcceleration: true,
    customModelPath: null,
    onChange: (key, value) => console.log('Change:', key, value),
    onBack: () => console.log('Back'),
  },
};

export const ModelNotLoaded: Story = {
  args: {
    ...ModelRunning.args,
    isModelRunning: false,
    modelSize: '3.2B parameters · 2.1 GB (not loaded)',
  },
};

export const CustomModelPath: Story = {
  args: {
    ...ModelRunning.args,
    customModelPath: '/Users/sky/models/custom-7b.gguf',
    inferenceThreads: 8,
    contextWindow: 16384,
  },
};

export const Mobile: Story = {
  args: { ...ModelRunning.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
