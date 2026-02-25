# Semblance — Press FAQ

## 1. How is Semblance different from ChatGPT, Gemini, or Copilot?

Cloud AI assistants run on remote servers. To be useful, they need your data — and once your data is on someone else's server, you've lost control of it. These services start every session at zero because storing your data permanently would require trust no cloud provider has earned.

Semblance runs entirely on your device. The AI Core has zero network access — no HTTP libraries, no WebSocket, no DNS. This is enforced at the OS level, not just by policy. Because everything is local, Semblance has permanent access to your entire digital life and gets more capable every day as your data compounds. Cloud assistants can never match this without becoming surveillance infrastructure.

## 2. If Semblance is open source, how does Veridian Synthetics make money?

The core product (AI Core, Gateway, knowledge graph, all free-tier features) is open source under MIT + Apache 2.0. Revenue comes from the Digital Representative tier ($18/month or $349 lifetime), which adds Alter Ego Mode and autonomous agency features. The Digital Representative module is proprietary, but every action it takes still flows through the open source Gateway and audit trail — so users can always verify what it does.

## 3. How can I verify the privacy claims?

Three ways:

1. **Read the code.** The entire core is open source. You can inspect every import in `packages/core/` and confirm there are no networking libraries.

2. **Run the privacy audit.** Execute `node scripts/privacy-audit/index.js` — it scans every file in the AI Core for network capability and fails if any violation is found.

3. **Use the Network Monitor.** The in-app Network Monitor shows every outbound connection in real time. If Semblance ever connects to a server you didn't authorize, you'll see it immediately.

## 4. Who built Semblance?

Semblance was built by Sky at Veridian Synthetics. It is a solo-developer project built on the conviction that ethical technology can compete with extractive systems.

## 5. What AI models does Semblance use?

Semblance uses locally-running open source language models. The default runtime is Ollama, with llama.cpp and MLX (Apple Silicon) as alternatives. Users can choose their preferred model — typically Llama 3.2, Phi-3, or similar open models. No model inference happens in the cloud. No data is sent to any AI provider.

On mobile, Semblance runs optimized smaller models (1B-3B parameters) directly on the device, with seamless handoff to desktop for complex tasks over local network.

## 6. What happens to my data if I stop using Semblance?

Your data stays on your device. Semblance stores everything locally in LanceDB (vector database) and SQLite. If you uninstall Semblance, you can keep the data files or delete them. There is no cloud account to close, no remote data to request deletion of, and no retention policy to worry about. Your data was never anywhere but your device.

## 7. What platforms does Semblance support?

Desktop: macOS, Windows, Linux (via Tauri 2.0 — Rust backend with web frontend).
Mobile: iOS (MLX inference) and Android (llama.cpp inference) via React Native.

Mobile is a peer device, not a companion — it runs full local inference and can hand off complex tasks to desktop over local network using mutual TLS authentication.
