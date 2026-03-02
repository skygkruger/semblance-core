// @vitest-environment jsdom
/**
 * AgentInput Voice UI Tests
 *
 * Tests the voice integration in AgentInput:
 * - Zero-footprint contract when voiceEnabled=false
 * - Mic button rendering and interactions per voice state
 * - Waveform, processing, speaking overlays
 * - Textarea suppression during voice active states
 * - Textarea cancellation behavior during listening
 * - audioLevel-driven waveform bar heights
 * - Custom placeholder hint system
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentInput } from '../../packages/semblance-ui/components/AgentInput/AgentInput';
import type { AgentInputProps } from '../../packages/semblance-ui/components/AgentInput/AgentInput.types';

function renderInput(overrides?: Partial<AgentInputProps>) {
  const defaults: AgentInputProps = {
    onSend: vi.fn(),
    onVoiceStart: vi.fn(),
    onVoiceStop: vi.fn(),
    onVoiceCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<AgentInput {...defaults} />), props: defaults };
}

describe('AgentInput Voice UI', () => {
  // ─── Zero-footprint contract ─────────────────────────────────────────────

  it('voiceEnabled=false renders no mic button', () => {
    renderInput({ voiceEnabled: false });
    expect(screen.queryByTestId('voice-mic-button')).toBeNull();
  });

  it('voiceEnabled undefined (default) renders no mic button', () => {
    renderInput();
    expect(screen.queryByTestId('voice-mic-button')).toBeNull();
  });

  // ─── Mic button rendering ────────────────────────────────────────────────

  it('voiceEnabled=true renders mic button', () => {
    renderInput({ voiceEnabled: true, voiceState: 'idle' });
    expect(screen.getByTestId('voice-mic-button')).toBeTruthy();
  });

  it('mic button has correct aria-label for idle state', () => {
    renderInput({ voiceEnabled: true, voiceState: 'idle' });
    expect(screen.getByTestId('voice-mic-button').getAttribute('aria-label')).toBe('Start voice input');
  });

  // ─── Mic button interactions ─────────────────────────────────────────────

  it('mic button fires onVoiceStart on click in idle state', () => {
    const { props } = renderInput({ voiceEnabled: true, voiceState: 'idle' });
    fireEvent.click(screen.getByTestId('voice-mic-button'));
    expect(props.onVoiceStart).toHaveBeenCalledTimes(1);
  });

  it('mic-active button fires onVoiceStop during listening', () => {
    const { props } = renderInput({ voiceEnabled: true, voiceState: 'listening' });
    fireEvent.click(screen.getByTestId('voice-mic-button'));
    expect(props.onVoiceStop).toHaveBeenCalledTimes(1);
  });

  it('error mic fires onVoiceStart (retry)', () => {
    const { props } = renderInput({ voiceEnabled: true, voiceState: 'error' });
    fireEvent.click(screen.getByTestId('voice-mic-button'));
    expect(props.onVoiceStart).toHaveBeenCalledTimes(1);
  });

  // ─── Voice overlays ──────────────────────────────────────────────────────

  it('voiceState=listening shows waveform overlay and textarea still in DOM', () => {
    renderInput({ voiceEnabled: true, voiceState: 'listening', audioLevel: 0.5 });
    expect(screen.getByTestId('voice-waveform')).toBeTruthy();
    // Textarea must still be present in DOM (opacity 0, not removed)
    expect(screen.getByTestId('agent-input-field')).toBeTruthy();
  });

  it('voiceState=processing shows processing indicator (no text, amber ring communicates)', () => {
    renderInput({ voiceEnabled: true, voiceState: 'processing' });
    expect(screen.getByTestId('voice-processing')).toBeTruthy();
    // No text — amber ring on mic button communicates processing state
    expect(screen.queryByText('Processing...')).toBeNull();
  });

  it('voiceState=processing disables send button', () => {
    renderInput({ voiceEnabled: true, voiceState: 'processing' });
    const sendBtn = screen.getByLabelText('Send');
    expect(sendBtn.hasAttribute('disabled')).toBe(true);
  });

  it('voiceState=speaking shows speaking indicator', () => {
    renderInput({ voiceEnabled: true, voiceState: 'speaking' });
    expect(screen.getByTestId('voice-speaking')).toBeTruthy();
    expect(screen.getByText('Speaking...')).toBeTruthy();
  });

  it('voiceState=error shows error-styled mic', () => {
    renderInput({ voiceEnabled: true, voiceState: 'error' });
    const mic = screen.getByTestId('voice-mic-button');
    expect(mic.className).toContain('agent-input__mic--error');
  });

  // ─── Textarea suppression during voice ───────────────────────────────────

  it('textarea has empty value when voiceState=listening', () => {
    renderInput({ voiceEnabled: true, voiceState: 'listening' });
    const textarea = screen.getByTestId('agent-input-field') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('textarea has empty value when voiceState=processing', () => {
    renderInput({ voiceEnabled: true, voiceState: 'processing' });
    const textarea = screen.getByTestId('agent-input-field') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
  });

  it('textarea is readOnly when voice is active', () => {
    renderInput({ voiceEnabled: true, voiceState: 'listening' });
    const textarea = screen.getByTestId('agent-input-field') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
  });

  it('textarea is not user-interactive (tabIndex=-1) when voice is active', () => {
    renderInput({ voiceEnabled: true, voiceState: 'speaking' });
    const textarea = screen.getByTestId('agent-input-field') as HTMLTextAreaElement;
    expect(textarea.tabIndex).toBe(-1);
    expect(textarea.getAttribute('aria-hidden')).toBe('true');
  });

  // ─── Placeholder hint ────────────────────────────────────────────────────

  it('shows default placeholder hint when idle and not focused', () => {
    renderInput({ voiceEnabled: true, voiceState: 'idle' });
    expect(screen.getByTestId('placeholder-hint')).toBeTruthy();
    expect(screen.getByText('Awaiting direction')).toBeTruthy();
  });

  it('hides placeholder hint when voice is active', () => {
    renderInput({ voiceEnabled: true, voiceState: 'listening' });
    expect(screen.queryByTestId('placeholder-hint')).toBeNull();
  });

  it('shows default "Awaiting direction" hint when no placeholder prop', () => {
    render(<AgentInput />);
    expect(screen.getByText('Awaiting direction')).toBeTruthy();
  });

  it('placeholder hint restored when voiceState returns to idle', () => {
    const { rerender } = render(
      <AgentInput voiceEnabled={true} voiceState="listening" />
    );
    expect(screen.queryByTestId('placeholder-hint')).toBeNull();

    rerender(
      <AgentInput voiceEnabled={true} voiceState="idle" />
    );
    expect(screen.getByTestId('placeholder-hint')).toBeTruthy();
    expect(screen.getByText('Awaiting direction')).toBeTruthy();
  });

  // ─── Textarea cancellation during listening ──────────────────────────────

  it('textarea keydown during listening fires onVoiceCancel', () => {
    const { props } = renderInput({ voiceEnabled: true, voiceState: 'listening' });
    const textarea = screen.getByTestId('agent-input-field');
    fireEvent.keyDown(textarea, { key: 'a' });
    expect(props.onVoiceCancel).toHaveBeenCalledTimes(1);
  });

  it('textarea focus during listening fires onVoiceCancel', () => {
    const { props } = renderInput({ voiceEnabled: true, voiceState: 'listening' });
    const textarea = screen.getByTestId('agent-input-field');
    fireEvent.focus(textarea);
    expect(props.onVoiceCancel).toHaveBeenCalledTimes(1);
  });

  // ─── Existing behavior preserved ────────────────────────────────────────

  it('send button still works when voiceEnabled=true and voiceState=idle', () => {
    const onSend = vi.fn();
    render(<AgentInput voiceEnabled={true} voiceState="idle" onSend={onSend} />);
    const textarea = screen.getByTestId('agent-input-field');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByLabelText('Send'));
    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('keyboard Enter still sends when voiceEnabled=true', () => {
    const onSend = vi.fn();
    render(<AgentInput voiceEnabled={true} voiceState="idle" onSend={onSend} />);
    const textarea = screen.getByTestId('agent-input-field');
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  // ─── audioLevel drives waveform ──────────────────────────────────────────

  it('audioLevel prop drives waveform bar heights via style', () => {
    renderInput({ voiceEnabled: true, voiceState: 'listening', audioLevel: 0.8 });
    const bars = screen.getByTestId('voice-waveform').querySelectorAll('.agent-input__waveform-bar');
    expect(bars.length).toBe(5);
    // Center bar (index 2) should have the highest value: scale=1.0, audioLevel=0.8 => max(4, round(1.0*0.8*20))=16
    const centerBar = bars[2] as HTMLElement;
    expect(centerBar.style.height).toBe('16px');
    // Edge bars (index 0,4) should be smaller: scale=0.4, audioLevel=0.8 => max(4, round(0.4*0.8*20))=6
    const edgeBar = bars[0] as HTMLElement;
    expect(edgeBar.style.height).toBe('6px');
  });

  // ─── No voice overlay when idle ──────────────────────────────────────────

  it('no voice overlay when voiceEnabled=true but state is idle', () => {
    renderInput({ voiceEnabled: true, voiceState: 'idle' });
    expect(screen.queryByTestId('voice-overlay')).toBeNull();
  });
});
