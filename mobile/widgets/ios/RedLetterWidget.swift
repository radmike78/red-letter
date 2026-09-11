import WidgetKit
import SwiftUI

// Red Letter home-screen widget (iOS).
//
// Renders the single line the app writes into the shared App Group container:
// the next marked day, how far away it is, and how many things are on it.
//
// The widget does no date arithmetic and no parsing beyond one small JSON
// object. Everything it shows was computed and sanitised by the app before
// being written out (see src/features/widgetSnapshot.ts), which keeps one
// implementation of "what is the next Red Letter day" rather than two that can
// disagree.
//
// NOT WIRED INTO THE BUILD. See widgets/README.md for the integration steps.

/// Must match the App Group configured on both the app and this extension.
private let appGroupIdentifier = "group.com.redletter.app"

/// Must match the key the native snapshot writer uses.
private let snapshotKey = "redletter.widget.snapshot"

// MARK: - Snapshot

struct RedLetterSnapshot: Decodable {
    let version: Int
    let hasNext: Bool
    let title: String
    let distance: String
    let longDate: String
    let date: String
    let count: Int
    let builtFor: String

    static let empty = RedLetterSnapshot(
        version: 1,
        hasNext: false,
        title: "",
        distance: "",
        longDate: "",
        date: "",
        count: 0,
        builtFor: ""
    )

    /// Reads the snapshot, falling back to "nothing ahead" on anything
    /// unexpected. A widget that renders an error is worse than one that
    /// quietly says the calendar is empty.
    static func load() -> RedLetterSnapshot {
        guard
            let defaults = UserDefaults(suiteName: appGroupIdentifier),
            let json = defaults.string(forKey: snapshotKey),
            let data = json.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(RedLetterSnapshot.self, from: data),
            decoded.version == 1
        else {
            return .empty
        }
        return decoded
    }
}

// MARK: - Timeline

struct RedLetterEntry: TimelineEntry {
    let date: Date
    let snapshot: RedLetterSnapshot
}

struct RedLetterProvider: TimelineProvider {
    func placeholder(in context: Context) -> RedLetterEntry {
        RedLetterEntry(
            date: Date(),
            snapshot: RedLetterSnapshot(
                version: 1,
                hasNext: true,
                title: "Anniversary",
                distance: "In 3 weeks",
                longDate: "Saturday, 14 March",
                date: "2026-03-14",
                count: 1,
                builtFor: ""
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (RedLetterEntry) -> Void) {
        completion(RedLetterEntry(date: Date(), snapshot: RedLetterSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RedLetterEntry>) -> Void) {
        let entry = RedLetterEntry(date: Date(), snapshot: RedLetterSnapshot.load())

        // Refresh just after the next local midnight. "In 3 days" has to become
        // "In 2 days" on its own; the app also reloads timelines when the
        // calendar is edited, so this is only the fallback for an untouched app.
        let midnight = Calendar.current.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 1),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)

        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

// MARK: - Views

private let paper = Color(red: 0.984, green: 0.980, blue: 0.972)
private let ink = Color(red: 0.102, green: 0.098, blue: 0.090)
private let inkMuted = Color(red: 0.420, green: 0.408, blue: 0.384)
private let redLetterRed = Color(red: 0.702, green: 0.149, blue: 0.118)

struct RedLetterWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RedLetterEntry

    var body: some View {
        Group {
            if entry.snapshot.hasNext {
                content
            } else {
                empty
            }
        }
        .containerBackground(for: .widget) { paper }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.snapshot.distance.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .kerning(0.6)
                .foregroundStyle(redLetterRed)

            Text(entry.snapshot.title)
                .font(.system(size: family == .systemSmall ? 17 : 20, weight: .semibold))
                .foregroundStyle(ink)
                .lineLimit(family == .systemSmall ? 3 : 2)
                .minimumScaleFactor(0.8)

            Spacer(minLength: 0)

            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(inkMuted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var subtitle: String {
        let extra = entry.snapshot.count - 1
        guard extra > 0 else { return entry.snapshot.longDate }
        return "\(entry.snapshot.longDate) · \(extra) more"
    }

    /// The empty state is the product, not a failure: most days are meant to
    /// be empty, so it says so plainly rather than prompting for input.
    private var empty: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("NOTHING AHEAD")
                .font(.system(size: 11, weight: .semibold))
                .kerning(0.6)
                .foregroundStyle(inkMuted)
            Text("The year is open.")
                .font(.system(size: 15))
                .foregroundStyle(ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Widget

@main
struct RedLetterWidget: Widget {
    private let kind = "RedLetterWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RedLetterProvider()) { entry in
            RedLetterWidgetView(entry: entry)
        }
        .configurationDisplayName("Next Red Letter day")
        .description("The next day you have marked, and nothing else.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
