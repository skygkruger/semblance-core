# Bundled Node runtimes

Production Semblance desktop builds ship a self-contained Node.js binary per platform
triple. System Node is not required in release builds.

## Layout

```
runtimes/
  active-platform.json          # pointer to the last bundled platform (build machine)
  darwin-arm64/
    runtime-manifest.json       # sha256 + node version metadata
    node                        # copied from process.execPath at build time (gitignored)
  darwin-x64/
  linux-x64/
  win32-x64/
    node.exe
```

Large `node` / `node.exe` binaries are **not committed**. Manifest JSON files may be
generated locally during `beforeBuildCommand`.

## Commands

```bash
node scripts/bundle-runtimes.js
node scripts/bundle-runtimes.js --check
```

Tauri `beforeBuildCommand` runs the bundler automatically before packaging.

## Escape hatches (non-production)

- Debug builds may fall back to `PATH` Node when no bundled runtime is present.
- Set `SEMBLANCE_ALLOW_SYSTEM_NODE=1` to permit system Node in release builds (CI/dev only).
