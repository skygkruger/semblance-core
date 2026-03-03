/// <reference types="vite/client" />

// Vite asset imports — explicit declarations for CI environments
// where vite/client types may not fully resolve.
declare module '*.wav?url' {
  const src: string;
  export default src;
}
