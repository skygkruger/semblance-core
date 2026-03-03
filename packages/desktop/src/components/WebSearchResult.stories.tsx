import type { Meta, StoryObj } from '@storybook/react';
import { WebSearchResult } from './WebSearchResult';

const meta: Meta<typeof WebSearchResult> = {
  title: 'Desktop/Search/WebSearchResult',
  component: WebSearchResult,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof WebSearchResult>;

export const BraveResults: Story = {
  args: {
    query: 'TypeScript monorepo best practices 2026',
    provider: 'brave',
    results: [
      { title: 'Modern Monorepo Architecture with TypeScript', url: 'https://blog.example.com/typescript-monorepo-2026', snippet: 'An in-depth guide to structuring TypeScript monorepos with pnpm workspaces, turborepo caching, and shared configuration patterns.', age: '2 days ago' },
      { title: 'pnpm Workspaces + TypeScript: The Complete Guide', url: 'https://docs.example.dev/pnpm-typescript', snippet: 'Learn how to set up a production-grade TypeScript monorepo using pnpm workspaces with proper type checking, incremental builds, and dependency management.' },
      { title: 'Turborepo vs Nx for TypeScript Monorepos', url: 'https://comparison.example.io/turbo-vs-nx', snippet: 'A detailed comparison of Turborepo and Nx for managing TypeScript monorepos, including benchmarks, DX, and migration paths.', age: '1 week ago' },
    ],
  },
};

export const SearxngResults: Story = {
  args: {
    query: 'Ed25519 signature verification JavaScript',
    provider: 'searxng',
    results: [
      { title: 'tweetnacl-js: Ed25519 in the browser', url: 'https://github.com/example/tweetnacl-js', snippet: 'TweetNaCl.js is a port of TweetNaCl / NaCl to JavaScript for modern browsers and Node.js. Supports Ed25519 signing and verification.' },
      { title: 'Web Crypto API: Ed25519 Support', url: 'https://developer.example.org/web-crypto-ed25519', snippet: 'The Web Crypto API now supports Ed25519 key generation, signing, and verification natively in browsers.' },
    ],
  },
};

export const SingleResult: Story = {
  args: {
    query: 'Semblance local AI assistant',
    provider: 'brave',
    results: [
      { title: 'Semblance — Your Intelligence. Your Device. Your Rules.', url: 'https://semblance.app', snippet: 'A fully local, self-hosted sovereign personal AI that runs entirely on your device. Your data never leaves.' },
    ],
  },
};
