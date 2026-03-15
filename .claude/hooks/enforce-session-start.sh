#!/bin/bash
# MANDATORY SESSION PROTOCOL GATE
# Blocks Edit/Write tool calls unless session-start has been run.
# The .session-active flag is created by: node scripts/session-start.js
# This hook enforces the SESSION_PROTOCOL.md workflow — no exceptions.

SESSION_FLAG="$HOME/.semblance/.session-active"

# Allow edits to session infrastructure files (the scripts themselves, hooks, CLAUDE.md)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Whitelist: session infrastructure files can always be edited
if [[ "$FILE_PATH" == *"scripts/session-start"* ]] || \
   [[ "$FILE_PATH" == *"scripts/session-end"* ]] || \
   [[ "$FILE_PATH" == *"scripts/checkpoint"* ]] || \
   [[ "$FILE_PATH" == *".claude/"* ]] || \
   [[ "$FILE_PATH" == *"CLAUDE.md"* ]] || \
   [[ "$FILE_PATH" == *"MEMORY.md"* ]] || \
   [[ "$FILE_PATH" == *"docs/sessions/"* ]] || \
   [[ "$FILE_PATH" == *"SEMBLANCE_STATE"* ]]; then
  exit 0
fi

# Check for session flag
if [ ! -f "$SESSION_FLAG" ]; then
  echo "BLOCKED: Session protocol not started." >&2
  echo "" >&2
  echo "Run: node scripts/session-start.js" >&2
  echo "" >&2
  echo "This creates ~/.semblance/.session-active after:" >&2
  echo "  1. Reading SEMBLANCE_STATE.md" >&2
  echo "  2. Running verification baseline" >&2
  echo "  3. Posting START report" >&2
  echo "" >&2
  echo "No code changes are allowed until the session protocol completes." >&2
  exit 2
fi

exit 0
