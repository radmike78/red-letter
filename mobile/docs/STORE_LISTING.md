# Store listing copy

Drafts. Edit freely — but the positioning is doing real work, so the note at
the bottom is worth reading before you rewrite it.

## App name

**Red Letter**

Subtitle (iOS, 30 chars max):

> Only the days that matter

Short description (Google Play, 80 chars max):

> A calendar for the days that matter, on the premise that most days don't.

## Full description

> Most planners assume your life is full. Red Letter assumes it isn't.
>
> It opens on the year — twelve months at once, almost all of it empty, with
> only the days you've marked showing in red. You can see your whole year at a
> glance, and see how much of it is still yours.
>
> Mark a day in a couple of seconds. A line of text, a time if it needs one.
> There's no priority, no category, no colour to pick, no repeat rule. Every one
> of those is a decision, and the point of this app is fewer of them.
>
> **Waiting on**
> A short list of things other people owe you — the quote, the callback, the
> refund — ordered by how long they've been sitting there. Not a to-do list.
> You're not the one who can finish these.
>
> **No guilt mechanics**
> No streaks. No completion percentage. No notification because you haven't
> opened the app. Falling out of the habit is fine; you can always come back.
>
> **Private by construction**
> No account. No server. No analytics. Red Letter makes no network requests at
> all — on Android the internet permission is removed from the app entirely, so
> the operating system itself refuses any connection. Your days are encrypted
> on your device with a key held in the Keychain.
>
> - Opens on the year, not on today
> - Reminders the evening before, delivered locally
> - Optional Face ID / fingerprint lock
> - Import .ics files; export a backup you keep
> - Write your marked days to your device calendar — write-only, so the app
>   never reads it
> - Works completely offline, because there's nowhere else for it to work

## Keywords (iOS, 100 chars, comma-separated, no spaces)

```
calendar,year,planner,minimal,private,offline,reminders,dates,anniversary,waiting,simple,quiet
```

## App Review notes (Apple — paste into App Review Information)

Red Letter is a native app rather than a wrapped web page, and uses:

- Local notifications scheduled by the OS, which fire while the app is closed
- EventKit / device calendar writing, requested with **write-only** access
- Biometric authentication for an optional app lock
- On-device encrypted storage with keys in the Keychain

The app makes no network requests. The `INTERNET` permission is removed from
the Android build. No data is collected, so all privacy labels are "Data Not
Collected".

To test: the app opens on the year view. Tap any month, then any day, to mark
it. Settings contains reminders, app lock, backup export/restore and .ics
import.

## Screenshot plan

Order matters more than usual here.

1. **The year view, mostly empty.** This is the entire pitch. Do not pick a
   busy year — pick one with four or five marked days. Caption:
   *"Your whole year. Mostly empty, which is the point."*
2. **A month**, with two marked days. Caption: *"Only plan the days that need
   planning."*
3. **A day being marked.** Caption: *"A line of text. That's the whole
   interaction."*
4. **Waiting on.** Caption: *"Things other people owe you, and how long it's
   been."*
5. **Settings / privacy.** Caption: *"No account. No server. No network."*

### The conversion problem, stated plainly

You are selling subtraction in a grid where the thumbnail is the sales pitch.
The competing listing shows forty colourful pages; yours shows one clean
screen, and in a row of search results **empty reads as "less product"**.

That is solvable but only deliberately:

- Put the words on the screenshots. The first image has to say *why* it is
  empty, or it reads as unfinished.
- Lead with the year view, never with a single day. One day looks like a notes
  app; a whole year mostly empty looks like a thesis.
- Use the full screenshot count. Restraint in the product should not mean
  restraint in the listing.
