import type { Meta, StoryObj } from '@storybook/react';
import { WebFetchSummary } from './WebFetchSummary';

const meta: Meta<typeof WebFetchSummary> = {
  title: 'Desktop/Search/WebFetchSummary',
  component: WebFetchSummary,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof WebFetchSummary>;

export const ArticleFetch: Story = {
  args: {
    url: 'https://blog.example.com/typescript-monorepo-2026',
    title: 'Modern Monorepo Architecture with TypeScript',
    content: 'Setting up a TypeScript monorepo in 2026 requires careful consideration of your build toolchain, dependency management, and type checking strategy. In this guide, we explore the most effective patterns for structuring large-scale TypeScript projects using pnpm workspaces. The key insight is that shared types should flow through package boundaries via explicit exports, not implicit path aliases. This ensures that each package can be built independently while maintaining full type safety across the monorepo.',
    bytesFetched: 48200,
    contentType: 'text/html',
  },
};

export const SmallPage: Story = {
  args: {
    url: 'https://api.example.com/status',
    title: 'API Status',
    content: 'All systems operational. Last incident: None in the past 90 days.',
    bytesFetched: 312,
    contentType: 'text/plain',
  },
};

export const LargeDocument: Story = {
  args: {
    url: 'https://docs.example.dev/specification/v2',
    title: 'Protocol Specification v2.0',
    content: 'This document defines the wire protocol for inter-service communication in distributed systems. Section 1 covers the handshake sequence, including mutual TLS authentication and capability negotiation. Section 2 describes the message framing format, with support for streaming responses and backpressure signaling. Section 3 outlines error handling semantics, including retry policies, circuit breakers, and graceful degradation strategies for partial failures.',
    bytesFetched: 2_340_000,
    contentType: 'text/html',
  },
};
