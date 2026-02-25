# Reproducible Builds

> Step 30b — Build verification and supply chain integrity.

---

## Overview

Reproducible builds allow anyone to verify that the published Semblance binary was built from the published source code. This is a critical trust property: users can confirm that no malicious code was injected during the build process.

## How It Works

1. **Frozen lockfile** — `pnpm install --frozen-lockfile` ensures exact dependency versions
2. **Deterministic build** — TypeScript compilation with fixed compiler options
3. **Build manifest** — SHA-256 checksums of all output artifacts
4. **Git commit binding** — Build manifest records the exact git commit

## Running the Script

```bash
./scripts/reproducible-build.sh
```

This will:
1. Record git commit hash and build metadata
2. Clean previous build artifacts
3. Install dependencies from frozen lockfile
4. Run the build
5. Compute SHA-256 checksums of all output files
6. Write `build-manifest.txt` to the project root

## Verifying a Build

To verify that a release binary matches the source:

```bash
# 1. Check out the tagged release commit
git checkout v0.30.0

# 2. Run the reproducible build
./scripts/reproducible-build.sh

# 3. Compare checksums against the published manifest
diff build-manifest.txt published-manifest.txt
```

If all checksums match, the binary was built from the published source.

## Limitations

- **Native dependencies** — Rust compilation (Tauri, LanceDB) may produce different binaries across platforms due to compiler differences. The manifest currently covers JavaScript/TypeScript output only.
- **Timestamp-dependent code** — Any code that embeds build timestamps will differ between builds. Avoid embedding timestamps in output artifacts.
- **OS-specific paths** — Path separators may differ between Windows and Unix builds. The manifest normalizes paths where possible.

## Future Work

- **Code signing** — Sign release binaries with a published key
- **SBOM generation** — Software Bill of Materials for dependency transparency
- **Rust reproducibility** — Investigate deterministic Rust compilation flags
- **CI integration** — Automated reproducibility checks in the release pipeline
