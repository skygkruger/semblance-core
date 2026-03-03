// Global type declarations for the Semblance monorepo.
// These declarations are picked up by the root tsconfig.json when
// files from excluded packages (desktop, mobile) are pulled in
// transitively through imports.

// Vite asset imports (used by packages/desktop for sound files)
declare module '*.wav?url' {
  const src: string;
  export default src;
}
