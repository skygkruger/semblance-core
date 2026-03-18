# Session: 2026-03-15 - main (BitNet Engine + Qwen Default + Tool Intent Extraction)

## Git State
- Branch: `main`
- Commit: `f9d7b6c` - fix: intent extraction for tool calling + compact tool definitions
- Uncommitted: No
- Pushed: Yes

## Work Context
**Active WO:** TODO-05 (Inference), TODO-04 (Web Search)
**Task:** Ship working local inference with reliable tool calling
**Progress:** 18 commits this session. Major pivot from BitNet 1-bit to Qwen Q4_K_M default.

## What Got Done (18 commits)

### Core Infrastructure
- BitNet.cpp native engine: AVX2 fix, interface stubs, FFI bindings working
- DuckDuckGo zero-config web search + deep_search_web tool
- Qwen function-call parser (tool_name({}) format)
- Intent extraction: orchestrator extracts tool intent from narration

### Critical Pivot
- Falcon3 10B 1.58-bit PTQ: unusable for conversation
- Switched default to Qwen 2.5 7B Q4_K_M (proven quality)
- Workstation default Q8_0 → Q4_K_M (2x faster on CPU)

### Tool Calling Solution
- Small models (7B) narrate intent instead of formatting tool calls
- Old approach: retry without tools (counterproductive)
- New approach: extractToolIntent() parses user message + model narration
  → determines which tool → executes directly → synthesizes results
- Covers: web search, email, calendar, reminders, file search
- NativeProvider tool defs: 1400 chars → 300 chars (compact)

### UX Fixes
- Auto-synthesis after tool approval (no reprompting)
- Model name display, Inbox crash, approval labels, tool result formatting
- Stop token leak (<|end|>), system prompt trimming, prompt templates
- Ollama auto-override removed

## What's Working
- Qwen 2.5 7B Q4_K_M: good comprehension, knows names, follows instructions
- BitNet.cpp engine compiles and runs (AVX2)
- DuckDuckGo web search (zero-config)
- Intent extraction for tool calls
- All UI fixes (model name, inbox, labels, formatting)

## What Needs Verification
- Intent extraction actually triggering and executing web search
- Speed improvement with compact tool defs (~300 fewer tokens)
- End-to-end: user asks for search → auto-executes → synthesizes → shows result
- <|end|> token no longer leaking

## Next Steps
1. Build and test with user
2. Verify tool calling works end-to-end
3. Address any remaining speed concerns
4. Update SEMBLANCE_STATE.md
5. Session end protocol

## Key Architecture Decisions
- Qwen Q4_K_M is default (not BitNet 1-bit PTQ)
- BitNet.cpp is still the inference engine (runs all GGUF)
- Intent extraction at orchestrator level (model-format-independent)
- Compact tool defs for small models
- DuckDuckGo default, SearXNG before launch

---
*Session saved: 2026-03-15T14:10:00Z*
