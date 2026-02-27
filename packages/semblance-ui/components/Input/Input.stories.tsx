import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: 'Enter text...' },
};

export const Focused: Story = {
  args: { placeholder: 'Click to see focus ring', autoFocus: true },
};

export const WithValue: Story = {
  args: { defaultValue: 'sky@veridian.run' },
};

export const Error: Story = {
  args: {
    error: true,
    errorMessage: 'EMAIL ADDRESS NOT FOUND',
    defaultValue: 'invalid@email',
  },
};

export const Disabled: Story = {
  args: { placeholder: 'Disabled input', disabled: true },
};
