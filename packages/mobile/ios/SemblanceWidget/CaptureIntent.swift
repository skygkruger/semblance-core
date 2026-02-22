// CaptureIntent — App Intent for quick capture action from widget.
// Allows capturing text directly from the widget interaction.

import AppIntents
import Foundation

struct QuickCaptureIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Capture"
    static var description: IntentDescription = IntentDescription("Capture a quick thought for Semblance.")

    @Parameter(title: "Text")
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Capture \(\.$text)")
    }

    func perform() async throws -> some IntentResult {
        SharedStorage.saveCapture(text)
        return .result()
    }
}
