# Red Letter — mobile

A calendar for the days that matter, on the premise that most days do not.

It opens on the year. Twelve months at once, almost all of it empty, with only
the marked days inked in red. Every other planner opens on today; opening on
the year is the argument the product is making, not a view option.

## Running it

```sh
cd mobile
npm install
npx expo prebuild        # generates ios/ and android/
npx expo run:ios         # needs a Mac with Xcode
npx expo run:android     # needs Android Studio
```

Expo Go will not work: the app uses native modules (Keychain, biometrics,
calendar) that need a development build.

```sh
npm test          # 136 tests
npm run typecheck
```

## What is in it

- **Year** — the default screen. Months as dot grids; a red dot is a marked day.
- **Month** — the same month opened up, with the marked days listed underneath.
- **Day** — one text field and an optional time. No priority, no category, no
  colour, no repeat. Each of those is a decision the product exists to spare you.
- **Waiting on** — things other people owe you, ordered by how long they have
  been sitting there. Not a task list: you are not the one who can finish these.
- **Settings** — reminders, app lock, export, restore, `.ics` import.

There is no streak, no completion percentage, and no notification for not
opening the app. The product's position is that falling out of the habit is
fine, so an app that nagged about it would be arguing with itself.

## Layout

```
app/                    Screens (expo-router)
src/core/               Pure logic. No React, no native imports. All tested.
  dates.ts              Local date keys, never timestamps
  validate.ts           Sanitising and rebuilding untrusted input
  ics.ts                The .ics reader
  envelope.ts           Encrypt/decrypt for the data file
  queries.ts            Derived views
  reminders.ts          Which reminders to schedule
src/storage/            Keychain key, encrypted file, React state
src/features/           Notifications, calendar export, backup, lock
plugins/                Native hardening applied at prebuild
widgets/                Home-screen widgets — written, not wired in
```

`src/core` is deliberately free of React and native imports. That is what makes
the security-critical parts — the parser, the validators, the crypto envelope —
testable on plain Node, which is why they have hostile-input tests rather than
assurances.

## Security

The full reasoning is in [`SECURITY.md`](./SECURITY.md). The short version:

- **No network.** Not "no network calls" — the `INTERNET` permission is stripped
  from the Android build, so the OS refuses any socket.
- **No accounts, no server, no analytics.** Nothing to breach, nothing to
  exfiltrate, no privacy label to declare.
- **Encrypted at rest** with XChaCha20-Poly1305 under a key in the Keychain /
  Keystore.
- **Untrusted input is rebuilt, never adopted.** Backups and `.ics` files are
  walked against our own schema; ids are always regenerated.
- **Calendar access is write-only on iOS.** The app never reads your calendar.

## Known gaps

- **The widget is not wired into the build.** See [`widgets/README.md`](./widgets/README.md).
- **Device-dependent paths are unverified.** Biometrics, notification delivery,
  calendar writing and the document picker were written against the SDK but
  have not been exercised on a real device. The logic around them is tested;
  the native round trip is not.
- **`.ics` recurrence is not expanded.** A repeating event imports as its first
  occurrence. This is deliberate — see the comment on `parseIcs`.
- **No iCloud or Google sync.** Export and restore are the migration path.
