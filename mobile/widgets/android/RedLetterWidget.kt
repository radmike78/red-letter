package com.redletter.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import org.json.JSONObject

/**
 * Red Letter home-screen widget (Android, Jetpack Glance).
 *
 * The counterpart to widgets/ios/RedLetterWidget.swift, reading the same
 * snapshot the app writes (see src/features/widgetSnapshot.ts). All the
 * wording and date arithmetic is done once, in TypeScript, so the two
 * platforms cannot drift apart.
 *
 * NOT WIRED INTO THE BUILD. See widgets/README.md for the integration steps.
 */

/** Must match the name the native snapshot writer uses. */
private const val PREFS_NAME = "redletter.widget"
private const val SNAPSHOT_KEY = "redletter.widget.snapshot"

private val Paper = Color(0xFFFBFAF8)
private val Ink = Color(0xFF1A1917)
private val InkMuted = Color(0xFF6B6862)
private val RedLetterRed = Color(0xFFB3261E)

private data class Snapshot(
    val hasNext: Boolean,
    val title: String,
    val distance: String,
    val longDate: String,
    val count: Int,
) {
    companion object {
        val EMPTY = Snapshot(false, "", "", "", 0)

        /**
         * Reads the snapshot, falling back to "nothing ahead" on anything
         * unexpected. A widget showing an error is worse than one that quietly
         * says the calendar is empty.
         */
        fun load(context: Context): Snapshot {
            return try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val raw = prefs.getString(SNAPSHOT_KEY, null) ?: return EMPTY
                val json = JSONObject(raw)
                if (json.optInt("version") != 1) return EMPTY

                Snapshot(
                    hasNext = json.optBoolean("hasNext", false),
                    title = json.optString("title", ""),
                    distance = json.optString("distance", ""),
                    longDate = json.optString("longDate", ""),
                    count = json.optInt("count", 0),
                )
            } catch (error: Exception) {
                EMPTY
            }
        }
    }
}

class RedLetterWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = Snapshot.load(context)
        provideContent {
            GlanceTheme {
                WidgetBody(snapshot)
            }
        }
    }
}

@Composable
private fun WidgetBody(snapshot: Snapshot) {
    Column(
        modifier = GlanceModifier.fillMaxSize().background(Paper).padding(12.dp),
        verticalAlignment = Alignment.Top,
        horizontalAlignment = Alignment.Start,
    ) {
        if (snapshot.hasNext) {
            Text(
                text = snapshot.distance.uppercase(),
                style = TextStyle(color = androidx.glance.unit.ColorProvider(RedLetterRed), fontSize = 11.sp, fontWeight = FontWeight.Medium),
            )
            Text(
                text = snapshot.title,
                maxLines = 3,
                style = TextStyle(color = androidx.glance.unit.ColorProvider(Ink), fontSize = 17.sp, fontWeight = FontWeight.Bold),
                modifier = GlanceModifier.padding(top = 4.dp),
            )
            Text(
                text = subtitle(snapshot),
                maxLines = 1,
                style = TextStyle(color = androidx.glance.unit.ColorProvider(InkMuted), fontSize = 12.sp),
                modifier = GlanceModifier.padding(top = 6.dp),
            )
        } else {
            // The empty state is the product, not a failure.
            Text(
                text = "NOTHING AHEAD",
                style = TextStyle(color = androidx.glance.unit.ColorProvider(InkMuted), fontSize = 11.sp, fontWeight = FontWeight.Medium),
            )
            Text(
                text = "The year is open.",
                style = TextStyle(color = androidx.glance.unit.ColorProvider(Ink), fontSize = 15.sp),
                modifier = GlanceModifier.padding(top = 4.dp),
            )
        }
    }
}

private fun subtitle(snapshot: Snapshot): String {
    val extra = snapshot.count - 1
    return if (extra > 0) "${snapshot.longDate} · $extra more" else snapshot.longDate
}

class RedLetterWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = RedLetterWidget()
}
