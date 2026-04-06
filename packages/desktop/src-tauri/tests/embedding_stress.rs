//! TEST 3: Metal Embedding Stress Test
//!
//! Hammers the NativeRuntime embedding path with rapid sequential requests
//! to verify the persistent-context fix prevents heap corruption.
//!
//! Issue 12: The app crashed with `BUG IN CLIENT OF LIBMALLOC: memory corruption
//! of free block` when indexing 5450 desktop files. Root cause was creating and
//! destroying a LlamaContext per embedding input, causing Metal GPU buffer
//! deallocation races.
//!
//! This test loads the real embedding model and runs 100+ embed calls in rapid
//! succession. If the context-reuse fix regresses, this test will crash or fail.
//!
//! Usage: cargo test --test embedding_stress -- --nocapture
//! Requires: nomic-embed model at ~/.semblance/data/models/
//!
//! Set MALLOC_GUARD_EDGES=1 MALLOC_SCRIBBLE=1 for extra sensitivity:
//!   MALLOC_GUARD_EDGES=1 MALLOC_SCRIBBLE=1 cargo test --test embedding_stress

use std::path::PathBuf;

// Import from the library crate
use semblance_desktop_lib::native_runtime::{NativeRuntime, EmbedRequest};

fn get_embedding_model_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let path = PathBuf::from(home)
        .join(".semblance")
        .join("data")
        .join("models")
        .join("nomic-embed-text-v1.5-q8_0.gguf");
    if path.exists() { Some(path) } else { None }
}

#[test]
fn embedding_stress_single_text_100_rounds() {
    let model_path = match get_embedding_model_path() {
        Some(p) => p,
        None => {
            eprintln!("⚠️  Skipping: embedding model not found at ~/.semblance/data/models/");
            return;
        }
    };

    let mut runtime = NativeRuntime::new();
    runtime
        .load_embedding_model(model_path.clone())
        .expect("Failed to load embedding model");

    eprintln!("Running 100 single-text embed calls...");

    for i in 0..100 {
        let request = EmbedRequest {
            model_path: model_path.to_string_lossy().to_string(),
            input: vec![format!("Test embedding input number {} for stress testing the Metal GPU context reuse", i)],
        };

        let result = runtime.embed(request);
        assert!(result.is_ok(), "Embed call {} failed: {:?}", i, result.err());

        let response = result.unwrap();
        assert_eq!(response.embeddings.len(), 1, "Expected 1 embedding, got {}", response.embeddings.len());
        assert_eq!(response.embeddings[0].len(), 768, "Expected 768-dim embedding, got {}", response.embeddings[0].len());

        // Verify embedding isn't all zeros (sanity check)
        let sum: f32 = response.embeddings[0].iter().sum();
        assert!(sum.abs() > 0.01, "Embedding {} is all zeros", i);

        if (i + 1) % 25 == 0 {
            eprintln!("  ✓ {} / 100 embed calls OK", i + 1);
        }
    }

    eprintln!("✅ 100 single-text embed calls completed without crash");
}

#[test]
fn embedding_stress_batch_texts() {
    let model_path = match get_embedding_model_path() {
        Some(p) => p,
        None => {
            eprintln!("⚠️  Skipping: embedding model not found");
            return;
        }
    };

    let mut runtime = NativeRuntime::new();
    runtime
        .load_embedding_model(model_path.clone())
        .expect("Failed to load embedding model");

    eprintln!("Running 20 batch embed calls (5 texts each = 100 total embeddings)...");

    for batch in 0..20 {
        let texts: Vec<String> = (0..5)
            .map(|j| format!(
                "Batch {} text {}: This is a longer test input to simulate real document chunks during desktop file indexing. \
                 The content varies to ensure different tokenization paths are exercised.",
                batch, j
            ))
            .collect();

        let request = EmbedRequest {
            model_path: model_path.to_string_lossy().to_string(),
            input: texts,
        };

        let result = runtime.embed(request);
        assert!(result.is_ok(), "Batch {} failed: {:?}", batch, result.err());

        let response = result.unwrap();
        assert_eq!(response.embeddings.len(), 5, "Batch {} returned {} embeddings instead of 5", batch, response.embeddings.len());

        for (j, emb) in response.embeddings.iter().enumerate() {
            assert_eq!(emb.len(), 768, "Batch {} embedding {} has wrong dimension", batch, j);
        }

        if (batch + 1) % 5 == 0 {
            eprintln!("  ✓ {} / 20 batches OK ({} total embeddings)", batch + 1, (batch + 1) * 5);
        }
    }

    eprintln!("✅ 100 batch embeddings completed without crash");
}

#[test]
fn embedding_stress_varying_lengths() {
    let model_path = match get_embedding_model_path() {
        Some(p) => p,
        None => {
            eprintln!("⚠️  Skipping: embedding model not found");
            return;
        }
    };

    let mut runtime = NativeRuntime::new();
    runtime
        .load_embedding_model(model_path.clone())
        .expect("Failed to load embedding model");

    eprintln!("Running varying-length embed calls (stress token boundary handling)...");

    // Vary input lengths dramatically to stress tokenizer + context boundaries
    let test_inputs: Vec<String> = vec![
        "Hi".to_string(),                                    // 1 token
        "Hello world".to_string(),                           // 2-3 tokens
        "The quick brown fox jumps over the lazy dog near the riverbank on a warm summer afternoon".to_string(), // ~20 tokens
        "A".repeat(500),                                     // Repetitive, tests chunking
        (0..50).map(|i| format!("word{}", i)).collect::<Vec<_>>().join(" "), // 50 unique words
        "🎵 Unicode test: café résumé naïve Ω∑∏ 日本語テスト 한국어".to_string(), // Unicode stress
        " ".repeat(100) + "actual content after whitespace", // Leading whitespace
    ];

    for (i, text) in test_inputs.iter().enumerate() {
        let request = EmbedRequest {
            model_path: model_path.to_string_lossy().to_string(),
            input: vec![text.clone()],
        };

        let result = runtime.embed(request);
        assert!(result.is_ok(), "Varying-length input {} ({} chars) failed: {:?}", i, text.len(), result.err());

        let response = result.unwrap();
        assert_eq!(response.embeddings[0].len(), 768);
        eprintln!("  ✓ Input {} ({} chars) OK", i, text.len());
    }

    eprintln!("✅ All varying-length inputs completed without crash");
}
