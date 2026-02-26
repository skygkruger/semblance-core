# Privacy Policy

**Semblance — Veridian Synthetics**
**Effective Date: March 1, 2026**
**Last Updated: February 25, 2026**

## The Short Version

Semblance collects zero data. We have no servers, no analytics, no telemetry, no crash reporting, no usage tracking, and no third-party SDKs that phone home. All your data stays on your device. We cannot access it, and we have designed the architecture to make it impossible for us to access it.

## 1. Data We Collect

None.

Semblance does not collect, transmit, store, or process any user data on any server, cloud service, or remote infrastructure. Specifically:

- **No analytics or telemetry.** We do not track how you use Semblance, what features you use, how often you open it, or any behavioral data whatsoever.
- **No crash reporting.** We do not collect crash logs, error reports, or diagnostic data.
- **No usage tracking.** We do not track sessions, screen views, button clicks, or any interaction data.
- **No cookies or identifiers.** Semblance does not use cookies, advertising identifiers, device fingerprinting, or any tracking technology.
- **No third-party SDKs.** Semblance contains zero third-party analytics, advertising, or tracking SDKs. We audit our dependency tree to enforce this.

## 2. Data Stored on Your Device

Semblance stores all user data exclusively on your device. This includes:

- **Knowledge graph** — Your emails, files, calendar entries, messages, contacts, and other data you choose to import, organized in a local vector database (LanceDB).
- **Embeddings** — Semantic embeddings of your data, computed locally, stored locally.
- **Structured data** — SQLite databases containing preferences, action history, audit trail entries, and application state.
- **Model weights** — Language model files downloaded to your device for local inference.
- **Configuration** — Your settings, autonomy preferences, and service connections.

This data never leaves your device. There is no cloud sync, no cloud backup, and no remote storage of any kind. If your device is off, your data is inaccessible to anyone, including us.

## 3. Network Activity

Semblance's AI Core (the component that reasons about your data) is architecturally prohibited from making any network calls. This is enforced at the code level and verified by automated privacy audits on every build.

The only component with network access is the Semblance Gateway, which makes outbound requests exclusively when:

- **You explicitly connect a service** (email, calendar, etc.) and the Gateway fetches data from that service using your credentials.
- **You ask Semblance to take an action** (send an email, create a calendar event, etc.) and the Gateway executes that action on your behalf.
- **You download a language model** for local inference.

Every network request is:
- Initiated by your explicit action or a standing instruction you configured
- Logged in a tamper-evident, append-only audit trail on your device
- Visible in the Network Monitor within the application
- Subject to an allowlist that you control

The Gateway never contacts Veridian Synthetics servers. We operate no servers that Semblance communicates with.

## 4. Data Sharing

We do not share any data because we do not have any data. Semblance's architecture makes data sharing impossible:

- We cannot access your device's local storage.
- We operate no servers that receive data from Semblance.
- There are no analytics pipelines, no data warehouses, no machine learning training pipelines that use your data.

## 5. Third-Party Services

When you connect third-party services (email providers, calendar services, etc.) to Semblance, the Gateway communicates directly with those services using your credentials. Veridian Synthetics is not an intermediary in these connections. Your credentials are stored locally on your device, never on our servers.

The privacy practices of those third-party services are governed by their own privacy policies.

## 6. Children's Privacy

Semblance does not collect personal information from anyone, including children under the age of 13 (or the applicable age in your jurisdiction). Since Semblance collects zero data, there is no data collection to restrict.

## 7. Data Retention

All data is stored locally on your device and retained until you delete it. We have no data to retain or delete on our end. You have complete control over your data at all times.

To delete all Semblance data, uninstall the application. All local databases, embeddings, and configuration files are removed with the application.

## 8. Security

Semblance protects your data through architectural security:

- **Process isolation** — The AI Core runs in a separate process with no network capability.
- **Action signing** — Every action is cryptographically signed and logged before execution.
- **Tamper-evident audit trail** — The action log uses hash chaining to detect any modification.
- **OS-level sandboxing** — The desktop application runs within OS sandbox constraints (macOS App Sandbox, Windows sandbox, Linux Flatpak).

## 9. Your Rights

Since we collect no data, traditional data subject rights (access, rectification, erasure, portability) do not apply to us — there is no data for us to provide, correct, delete, or transfer. All your data is already in your possession on your device.

## 10. Open Source

Semblance's core is open source under the MIT license. You can audit the source code to verify every claim in this privacy policy:

- Repository: https://github.com/skygkruger/semblance-core
- Automated privacy audit: `scripts/privacy-audit/`

## 11. Changes to This Policy

If we ever change this privacy policy, we will publish the updated version in the application and in the source repository. Given our architecture, the scope of possible changes is extremely limited — we cannot start collecting data without fundamentally changing the application's architecture, which would be visible in the open source code.

## 12. Contact

For questions about this privacy policy:

- **Email:** sky@veridian.run
- **GitHub Issues:** https://github.com/skygkruger/semblance-core/issues

---

Veridian Synthetics
https://semblance.run
