# Moving days between the app, the HTML file, and everything else

Someone with years of marked days in the HTML version should be able to open
them in the app, and vice versa. Two routes, for two different jobs.

## Which route to use

| You want to | Use | Why |
|---|---|---|
| Move the **whole calendar**, including Waiting On | **JSON backup** | Lossless. Carries everything. |
| Move **the days themselves** into another calendar | **`.ics`** | Universal. Google, Apple, Outlook, and the HTML version all read it. |

Both are in Settings → Your data.

## Route 1: `.ics` — the one that already works

The HTML version of Red Letter already parses `.ics`. That makes it the bridge
that needs no agreement between the two codebases:

- **App → HTML** — Settings → *Export a calendar file*, then open the `.ics` in
  the HTML version's import.
- **HTML → app** — export `.ics` from the HTML version, then Settings →
  *Import a calendar file*.
- **App → anything** — the same file imports into Google Calendar, Apple
  Calendar and Outlook.

### What survives the trip

| Field | Survives? |
|---|---|
| Title | Yes |
| Date | Yes |
| Time | Yes, as floating local time |
| Note | Yes, as `DESCRIPTION` |
| Waiting On | **No** — `.ics` has no concept of it. Use the JSON backup. |

`__tests__/interop.test.ts` exports a calendar and re-imports it through the
app's own parser, asserting titles, times, notes, accents and emoji all come
back intact.

### Deliberate choices in the output

- **Floating time**, no `Z` and no `TZID`. A marked day is a wall-clock thing —
  dinner at seven is at seven wherever you are. It also avoids shipping a
  `VTIMEZONE` block that readers disagree about.
- **All-day events use an exclusive `DTEND`**, the following day. This is the
  most commonly mis-written field in `.ics`; getting it wrong makes the event
  show on two days in some readers.
- **Stable `UID`s**, so re-importing the same file does not duplicate.
- **No alarms, no recurrence, no attendees.** A file this plain is one every
  reader agrees about, and agreement is the whole point.

## Route 2: JSON backup — lossless

Settings → *Export a backup* writes:

```json
{
  "format": "red-letter",
  "schemaVersion": 1,
  "exportedAt": "2026-09-15T10:30:00.000Z",
  "entries": {
    "2026-03-15": [
      { "id": "…", "title": "Wedding", "time": "14:00", "note": "…" }
    ]
  },
  "waiting": [
    { "id": "…", "title": "Passport", "since": "2026-01-02" }
  ]
}
```

### Importing a backup written by the HTML version

**This should just work, even though the two codebases were never coordinated.**
Restore does not require the file to use this app's exact field names. It
reshapes what it finds, accepting:

- `{ entries: { "2026-03-15": [...] } }` — this app's own shape
- `{ "2026-03-15": [...] }` — date keys at the top level, no wrapper
- `{ days: … }`, `{ items: … }`, `{ events: … }`, `{ marked: … }`,
  `{ calendar: … }`
- `{ data: … }`, `{ state: … }`, `{ payload: … }`, `{ backup: … }` — one
  wrapper layer, unwrapped
- `[ { date: "2026-03-15", title: "Wedding" }, … ]` — a flat list
- A day holding **bare strings** rather than objects: `{ "2026-03-15": ["Wedding"] }`
- Titles under `title`, `text`, `label`, `name`, `summary` or `description`
- Times as `14:00`, `2pm`, `2:00 PM`, `9:05` or `0905`
- Dates as `2026-03-15`, `2026/3/15`, or with a time glued on
- Waiting items under `waiting`, `waitingOn`, `blocked` or `pending`

**Being permissive about shape is not being permissive about content.** The
normaliser only *moves* values. Everything still goes through `rebuildData`
afterwards: titles sanitised and capped, dates validated as real days, times
range-checked, ids regenerated, limits enforced, prototype keys refused. A
hostile file gains nothing from any of this.

If a backup still will not open, that is a bug worth fixing — send the file
(or its top few lines) and the shape can be added to `src/core/interop.ts`.

## PDF

**PDF is a one-way street, and it is worth being honest about why.**

A PDF is a description of marks on a page. A hyperlinked planner PDF has no
structured record of "15 March has a wedding on it" — it has text positioned at
coordinates. Reading days back out means OCR-style heuristics over a layout,
which is guesswork that fails silently and puts wrong dates in someone's
calendar. That is worse than not offering it.

So: **there is no PDF import, and there should not be one.**

PDF *export* is a reasonable future feature — a printable year sheet is very
much in keeping with a product about seeing your whole year at once. It is not
built yet. If it is added, the right trick is to **embed the JSON backup as a
PDF file attachment**, so the same file both prints and re-imports losslessly.
That gets the printable artefact without the guesswork.

In the meantime, to get a PDF: export `.ics`, import it into a calendar that
prints, and print from there.

## Adding a shape

`src/core/interop.ts` holds the field-name lists near the top —
`ENTRY_CONTAINER_KEYS`, `TITLE_KEYS`, `TIME_KEYS` and so on. Adding a
spelling is usually one array entry plus a test case in
`__tests__/interop.test.ts`.
