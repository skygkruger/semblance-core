// SemblanceWidget — Quick capture widget for iOS home screen.
// Uses WidgetKit AppIntentTimelineProvider for dynamic updates.
// Captures stored in App Groups shared UserDefaults.

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared Data

struct QuickCapture: Codable, Identifiable {
    let id: String
    let text: String
    let timestamp: Date
}

enum SharedStorage {
    static let suiteName = "group.run.veridian.semblance"
    static let capturesKey = "quick_captures"

    static func loadCaptures() -> [QuickCapture] {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: capturesKey) else {
            return []
        }
        return (try? JSONDecoder().decode([QuickCapture].self, from: data)) ?? []
    }

    static func saveCapture(_ text: String) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        var captures = loadCaptures()
        let capture = QuickCapture(
            id: UUID().uuidString,
            text: text,
            timestamp: Date()
        )
        captures.insert(capture, at: 0)
        // Keep only the last 20 captures
        if captures.count > 20 {
            captures = Array(captures.prefix(20))
        }
        if let data = try? JSONEncoder().encode(captures) {
            defaults.set(data, forKey: capturesKey)
        }
    }
}

// MARK: - Timeline Entry

struct CaptureEntry: TimelineEntry {
    let date: Date
    let recentCaptures: [QuickCapture]
}

// MARK: - Timeline Provider

struct CaptureTimelineProvider: AppIntentTimelineProvider {
    typealias Entry = CaptureEntry
    typealias Intent = CaptureConfigurationIntent

    func placeholder(in context: Context) -> CaptureEntry {
        CaptureEntry(date: Date(), recentCaptures: [])
    }

    func snapshot(for configuration: CaptureConfigurationIntent, in context: Context) async -> CaptureEntry {
        let captures = SharedStorage.loadCaptures()
        return CaptureEntry(date: Date(), recentCaptures: Array(captures.prefix(3)))
    }

    func timeline(for configuration: CaptureConfigurationIntent, in context: Context) async -> Timeline<CaptureEntry> {
        let captures = SharedStorage.loadCaptures()
        let entry = CaptureEntry(date: Date(), recentCaptures: Array(captures.prefix(3)))
        // Refresh every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        return Timeline(entries: [entry], policy: .after(nextUpdate))
    }
}

// MARK: - Configuration Intent

struct CaptureConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Quick Capture"
    static var description: IntentDescription = IntentDescription("Capture a quick thought for Semblance to process.")
}

// MARK: - Widget View

struct SemblanceWidgetView: View {
    var entry: CaptureEntry

    @Environment(\.widgetFamily) var family

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "bubble.left.and.text.bubble.right")
                    .font(.caption)
                    .foregroundColor(.accentColor)
                Text("Semblance")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
            }

            if entry.recentCaptures.isEmpty {
                Spacer()
                Text("Tap to capture a thought")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            } else {
                ForEach(entry.recentCaptures.prefix(family == .systemSmall ? 2 : 3)) { capture in
                    Text(capture.text)
                        .font(.caption2)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                if family != .systemSmall {
                    Spacer()
                }
            }
        }
        .padding()
        .widgetURL(URL(string: "semblance://capture"))
    }
}

// MARK: - Widget Definition

struct SemblanceQuickCaptureWidget: Widget {
    let kind: String = "SemblanceQuickCapture"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: CaptureConfigurationIntent.self,
            provider: CaptureTimelineProvider()
        ) { entry in
            SemblanceWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Quick Capture")
        .description("Capture thoughts for Semblance to process locally.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
