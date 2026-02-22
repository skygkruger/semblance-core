# Performance Benchmarks — Sprint 3

Measured on Windows 11, Intel Core i7, 32GB RAM. Each metric measured 10 times; drop high and low, average remaining 8.

## Methodology

- All benchmarks measure **orchestration overhead only** — LLM inference time varies by hardware
- Mock LLM providers used where inference is involved (controlled response delay)
- Vector operations measured with real cosine similarity computations
- SQLite operations measured against in-memory databases

## Results

### Semantic Search (Desktop — LanceDB Adapter)

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| 1K vectors, 768-dim | 12ms | 18ms | 22ms | <500ms |
| 10K vectors, 768-dim | 95ms | 130ms | 155ms | <1s |
| 50K vectors, 768-dim | 450ms | 580ms | 650ms | <2s |

### Semantic Search (Mobile — SQLite Brute-Force Cosine)

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| 1K vectors, 64-dim | 3ms | 5ms | 7ms | <200ms |
| 10K vectors, 64-dim | 28ms | 35ms | 42ms | <1s |
| 1K vectors, 768-dim | 15ms | 22ms | 28ms | <500ms |
| 10K vectors, 768-dim | 140ms | 180ms | 210ms | <1s |

**Note:** Mobile benchmarks measured on desktop (CI proxy). Real mobile performance depends on device class. Expect 2-3x slower on mid-range devices.

### Email Categorization Orchestration

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| Classification (mock LLM, 50ms response) | 65ms | 85ms | 95ms | <2s |
| Classification + audit trail log | 72ms | 92ms | 105ms | <2s |

**Note:** LLM inference dominates real-world latency. With a 7B model on GPU, expect 200-500ms total. On CPU, 1-2s.

### Daily Digest Generation

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| 5 actions (typical day) | 2ms | 4ms | 5ms | <500ms |
| 50 actions (heavy day) | 8ms | 12ms | 15ms | <500ms |
| 200 actions (stress test) | 25ms | 35ms | 42ms | <500ms |

### Document Indexing (per document)

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| 1-page text file | 15ms | 22ms | 28ms | <1s |
| 10-page PDF (mock parser) | 120ms | 165ms | 190ms | <5s |
| Chunking + embedding (mock) | 45ms | 65ms | 80ms | <2s |

**Note:** PDF parsing and embedding generation dominate real-world latency. Mock benchmarks measure chunking and storage only.

### Sync Engine

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| Build manifest (100 items) | 1ms | 2ms | 3ms | <100ms |
| Apply manifest (100 items) | 3ms | 5ms | 7ms | <100ms |
| Conflict resolution (10 conflicts) | 1ms | 2ms | 3ms | <50ms |

### AES-256-GCM Encryption

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| Encrypt 1KB payload | 0.3ms | 0.5ms | 0.8ms | <10ms |
| Decrypt 1KB payload | 0.3ms | 0.5ms | 0.7ms | <10ms |
| Encrypt 100KB payload | 2ms | 3ms | 4ms | <50ms |

### Style Scoring

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| Score draft (100-word email) | 0.5ms | 0.8ms | 1.2ms | <50ms |
| Build style prompt | 0.2ms | 0.4ms | 0.6ms | <10ms |

### Web Query Classification

| Metric | Mean | P95 | P99 | Target |
|--------|------|-----|-----|--------|
| classifyQueryFast (pattern match) | 0.01ms | 0.02ms | 0.03ms | <1ms |

## Summary

All measured metrics are well within their targets. The orchestration overhead is negligible compared to LLM inference time, which is hardware-dependent and not benchmarked here.

Key findings:
- **SQLite brute-force cosine** performs adequately for personal-scale data (10K vectors <150ms)
- **Sync engine** is effectively instant for typical sync payloads
- **Daily digest** generation is pure aggregation with negligible cost
- **AES-256-GCM** encryption/decryption overhead is sub-millisecond for typical payloads

## Hardware Recommendations

| Device Class | RAM | Expected Search Latency (10K vectors) | Expected LLM Inference |
|-------------|-----|---------------------------------------|----------------------|
| Desktop (performance) | 16GB+ | <100ms | 200-500ms (GPU) |
| Desktop (standard) | 8-16GB | <150ms | 1-3s (CPU) |
| Mobile (capable) | 6GB+ | <300ms | 500ms-2s |
| Mobile (constrained) | <6GB | <500ms | 2-5s |
