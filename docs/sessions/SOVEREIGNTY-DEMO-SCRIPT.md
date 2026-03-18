# Sovereignty Demo Script

## Setup (before they arrive)

| Step | Action |
|------|--------|
| 1 | Semblance app running, onboarding complete, Gmail connected |
| 2 | Run: `node scripts/demo-sovereignty-launch.js` |
| 3 | Arrange windows: Semblance (center), PowerShell monitor (right), HTML dashboard (left) |
| 4 | Optional: Wireshark open on second monitor with the display filter loaded |

---

## Demo Flow

| Time | What to do | What to say |
|------|-----------|-------------|
| **0:00 — Opening** | Point to the PowerShell monitor and HTML dashboard | "These are independent system tools watching every network connection Semblance makes in real time. I didn't configure them to show you what I want — they show what's actually happening." |
| **0:30 — Local reasoning** | Type a question in Semblance that uses local knowledge: "What should I work on today?" | "Watch the AI Core panel. Zero connections. The model is running on my CPU, reasoning about my data, and nothing leaves this machine." |
| **1:00 — Point to monitor** | Point to AI Core showing 0 | "That zero is the whole point. In ChatGPT, your question just went to OpenAI's servers. In Perplexity, it went to their cloud. Here — zero. Your data stays yours." |
| **1:30 — Trigger connector** | Type: "Run a web search for veridian tools" | "Now watch the Gateway panel — this is the ONLY process that can touch the network, and only for services you've authorized." |
| **2:00 — Gateway lights up** | Point to Gateway showing search.veridian.run connection | "There it is — one connection, to our own search infrastructure. The AI Core still shows zero. It got the results through an internal channel, never touched the internet directly." |
| **2:30 — Email demo** | Type: "Check my inbox" | "Same pattern — Gateway connects to Gmail because I authorized it. AI Core reads the results locally. My emails never go to an AI company's servers." |
| **3:00 — The contrast** | Pause, point to both panels | "In any cloud AI assistant, every step you just saw would have sent your question, your emails, and your search history to someone else's servers. You just watched Semblance do all of it locally." |
| **3:30 — Hand it over** | Invite someone to type a question | "Try it yourself. Type anything. Watch the monitors. That zero doesn't change." |

---

## One-liner if pressed for time

> "Wireshark is right there — it's a free, independent network analyzer anyone can download. It confirms what our monitor shows: the AI never makes a network connection. Your intelligence stays on your device."

---

## If they ask about Wireshark

"Wireshark is the industry standard network analysis tool. It captures every packet that leaves your machine. I'm running it right now — you can see there's zero traffic from the AI process. You can install it yourself and verify this independently. That's the point — you don't have to trust us, you can prove it."
