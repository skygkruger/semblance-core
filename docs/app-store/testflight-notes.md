# Semblance TestFlight Notes

## Version 1.0.0

Thank you for testing Semblance! This is the initial release build.

## Setup

1. Launch Semblance — it will prompt you to download a local language model on first run
2. Model download requires Wi-Fi (typically 2-4GB depending on model choice)
3. Once downloaded, Semblance works entirely offline

## What to Test

- **Knowledge Graph Ingestion:** Connect email and calendar. Verify entities and relationships appear in the knowledge graph within 5 minutes.
- **Autonomy Tiers:** Try Guardian (shows preview before acting), Partner (routine actions autonomous), and Alter Ego (full autonomous) modes.
- **Daily Digest:** Check the morning digest after 24 hours of connected data.
- **Network Monitor:** Verify only authorized connections appear. Report any unexpected outbound connections immediately.
- **Desktop Handoff:** If you have the desktop app running on the same local network, test task handoff for complex queries.
- **Style Learning:** Send a few emails, then ask Semblance to draft a response. Verify it matches your voice.

## Known Limitations

- First model download requires network (all subsequent use is fully offline)
- On devices with less than 6GB RAM, the default model is smaller (1B parameters) — responses may be less detailed
- Desktop handoff requires both devices on the same local network
- Battery consumption is higher during initial knowledge graph ingestion

## Reporting Issues

- Use the in-app feedback form (Settings > Feedback)
- Do NOT include personal data in bug reports — use only synthetic or anonymized examples
- For security or privacy concerns, email security@semblance.run immediately

## Privacy Reminder

All data stays on this device. We have no access to your data, your knowledge graph, or your action history. TestFlight crash reports go to Apple, not to us — we do not receive any telemetry from the app itself.
