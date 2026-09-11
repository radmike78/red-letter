# Security

Red Letter's risk profile is unusually good, and most of that comes from what
the app does not do rather than from anything clever. This document records the
decisions, including the ones that were trade-offs.

## Where the risk actually is

The web version had almost no confidentiality problem: a browser tab cannot
read the phone's files, contacts or location, there was no server to breach and
no customer database to leak. The worst realistic outcome was corrupting one
user's own calendar on their own device.

Going native moves the risk rather than removing it:

| Moving to native | Handled by |
|---|---|
| A documents directory readable on a rooted or jailbroken device | Encrypted at rest, key in the Keychain / Keystore |
| Calendar permission exposing every work meeting | Write-only access on iOS; nothing is ever read |
| Analytics SDKs acting as data brokers | None, and no network permission to use one |
| `.ics` files as untrusted input | Same rebuild-don't-adopt rules as the web version |
| Sensitive values in plain preferences | Everything in the Keychain / Keystore |
| OS backups copying data to a cloud account | Backup and device-transfer excluded |

## No network, enforced

The app makes no network requests. That is enforced in the build rather than
merely being true of today's source: `plugins/withRedLetterSecurity.js` removes
`android.permission.INTERNET` and re-removes it with `tools:node="remove"` so a
library cannot merge it back in. The OS itself then refuses any socket.

This matters more than it sounds. It means a dependency added in six months
cannot quietly start phoning home, and the property survives a careless `npm
install` by someone who has not read this file. On iOS, App Transport Security
is set to refuse arbitrary loads, local networking and cleartext in web content.

Consequences, accepted deliberately:

- No crash reporting and no analytics. Bug reports come from users.
- Debug builds keep `INTERNET`, because Metro serves the bundle over it. **The
  removal only applies to release builds — verify it in the release manifest
  before shipping.**

## Data at rest

Everything the user writes is encrypted with **XChaCha20-Poly1305** (`@noble/ciphers`)
under a 256-bit key generated on the device.

- The key lives in the **iOS Keychain / Android Keystore** and nowhere else. It
  is never written to the documents directory, never in AsyncStorage, never
  logged.
- XChaCha20 was chosen over AES-GCM for its 192-bit nonce: a fresh random nonce
  on every write has no practical collision risk, so there is no counter to
  persist and no way for a restore to replay one.
- Writes are atomic — written alongside and moved into place — so a crash
  cannot leave a half-written calendar.
- A file that fails authentication is **left untouched**. Overwriting it would
  destroy the only copy that a recovered key could still open.

### Trade-off: `WHEN_UNLOCKED`, not `..._THIS_DEVICE_ONLY`

Device-only would be marginally stronger. It would also mean the key cannot
travel in an encrypted iCloud Keychain restore, so a user replacing their phone
would silently lose every marked day they had.

For a calendar of anniversaries that is a worse outcome than the threat it
defends against, and iCloud Keychain is itself end-to-end encrypted. Android
Keystore material is device-bound regardless, so **export is the migration path
on both platforms** and Settings makes it prominent.

### Trade-off: backups are plain JSON

The encrypted store protects data on the device. A backup the user has
deliberately sent to themselves needs to be readable in five years by whatever
they have then, and a file that only this build can open is not a backup. It is
written to the cache directory, handed to the share sheet, and deleted straight
afterwards, so it never lingers anywhere that gets swept into a cloud backup.

### A warning you will see during prebuild

```
Expo-secure-store tried to apply Android Auto Backup rules, but other
backup rules are already present.
```

Expected. `expo-secure-store` wants to exclude its own keys from backup; this
project already excludes everything (`domain="root"`, both cloud backup and
device transfer), which is strictly broader. Nothing to fix.

## Untrusted input

The rule inherited from the web version: **never adopt the shape of an
untrusted file.** We walk our own schema and pull each field across only if it
validates. A file cannot introduce a key we do not read.

This applies to restored backups, `.ics` imports, deep-link route parameters,
notification payloads coming back from the OS, and **our own data file**. There
is exactly one path by which data enters the app.

- **Ids are always regenerated.** The web version's bug was an id from a backup
  file breaking out of an HTML attribute. Regenerating removes the class of bug
  rather than patching one instance of it. React Native does not interpolate
  into HTML, so the original exploit does not apply — the rule is kept because
  it costs nothing and the next renderer might.
- **Titles and notes** are stripped of control characters (including NUL, which
  truncates strings in some native APIs) and of Unicode bidi overrides, which
  can visually reorder a title so it reads as something other than what is
  stored. Then capped at 300 and 2000 characters.
- **Date keys** must name a real day. `2026-02-30` matches the pattern and is
  still rejected.
- **Hard ceilings** on entries per day (50), entries total (10,000), waiting
  items (500), distinct days (5,000) and import size (2 MiB), so a malformed
  file is refused rather than exhausting memory.
- **Prototype pollution** is blocked by rejecting non-plain objects and
  skipping `__proto__`, `constructor` and `prototype` keys.

### The `.ics` reader

It parses only the four properties the app uses, never throws, caps line length
and line count, and handles folded lines, quoted parameters and the RFC 5545
text escapes.

**RRULE is not expanded**, deliberately. A weekly event with no `UNTIL` is
infinite, so expanding recurrence generates unbounded entries from a few bytes.
It is also a product decision: silently filling every Tuesday of the next decade
would destroy a calendar premised on empty days. Repeating events import as
their first occurrence and the count is reported.

`__tests__/ics.test.ts` and `__tests__/validate.test.ts` attack both with
hostile files — injection payloads, prototype pollution, malformed structure,
oversized fields, unclosed blocks.

## Links in entries

A calendar imports `.ics` files from strangers, and the classic attack is a
plausible event carrying a phishing link. `src/core/urls.ts` finds links in
entry text and judges them **entirely offline**.

Nothing opens automatically, nothing is fetched, and nothing is previewed. A
link is inert until the user has seen the real destination and confirmed. Red
Letter re-analyses at the moment of the tap rather than trusting the verdict
computed at render time.

**Refused outright** (never handed to the OS): `javascript:`, `data:`,
`file:`, `content:`, `intent:`, `blob:`, `vbscript:`, `jar:`, and anything
outside the allowlist of `http`, `https`, `mailto`, `tel`. An allowlist rather
than a blocklist, because every installed app can register a scheme handler, so
naming what is permitted is the only version that stays correct. These are
matched by name in the extractor too, since they carry no `//` and would
otherwise never be found in order to be refused.

**Flagged as deceptive:** credentials used to disguise the host
(`https://apple.com@evil.example` — the browser goes to `evil.example`),
punycode, hosts mixing Latin with Cyrillic or Greek, and raw IP addresses.
**Noted more mildly:** shorteners, plain `http`, unusual ports, deep
subdomains.

### Why there is no virus or malware scan

Checking links against Google Safe Browsing or VirusTotal was considered and
rejected. It would require:

1. **Network access**, which this app deliberately does not have.
2. **Sending the user's private calendar URLs to a third party** — the booking,
   the patient portal, the interview invitation. That is precisely the
   exfiltration the rest of this design makes impossible.
3. **An API key**, which cannot live safely in a client app, so it would need a
   backend — a server, and the breach liability avoided everywhere else.

It would also be largely redundant: Safari and Chrome run Safe Browsing on
every URL they open, so the reputation check already happens at the layer that
can do it without Red Letter seeing anything.

What is implemented instead is the part a reputation list is worst at —
spotting a link that is *structurally* pretending to be somewhere it is not —
which works on a domain registered an hour ago that no blocklist has yet seen.

**The limit, stated plainly:** this catches deception, not reputation. A
link to a genuinely malicious site at an honest-looking address will be
reported as `ok`. The browser's Safe Browsing is what catches that, and it
still runs.

## Permissions

Every permission is requested at the point of use, never at launch. A prompt
before the app has shown what it is for is the thing that gets it denied.

- **Calendar** — iOS uses a **write-only** grant. The app has no reason to read
  anyone's calendar; reading would hand it every work meeting and medical
  appointment the user has, for no feature. Only the title, date and optional
  time of a day the user explicitly exported are written. **Notes are never
  copied**, because the device calendar may sync to a work account.
  Android has no write-only calendar grant, so it asks for the pair it needs;
  this is disclosed in the Settings copy rather than buried.
- **Notifications** — local only. No push token, no server.
- **Biometrics** — only if the user turns the lock on. Off by default: a
  calendar of birthdays does not need a lock, and imposing one is the kind of
  ceremony this product is against. Falls back to the device passcode so a
  broken fingerprint sensor cannot lock someone out of their own calendar.
- **Explicitly blocked** in the manifest: location, camera, contacts,
  microphone, external storage, system alert window.

## What is not covered

Stated plainly, because a security document that only lists strengths is
marketing.

- **Not verified on a device.** Biometrics, notification delivery, calendar
  writing and the document picker were written against the SDK but never run on
  real hardware. Test them before shipping.
- **No jailbreak or root detection.** It is defeatable by anyone who has already
  rooted the device, and on a rooted phone the Keystore guarantees are weakened
  anyway. Encryption is the mitigation; detection would be theatre.
- **No screenshot blocking.** `FLAG_SECURE` would stop the app-switcher preview
  showing a marked day. It was left out because it also blocks legitimate
  screenshots of your own calendar, which people do. Reasonable to add if the
  audience skews sensitive.
- **The widget snapshot is plaintext** in a shared container by necessity —
  widget extensions cannot reach the app's Keychain key. Only the next day is
  written. See `widgets/README.md`.
- **No integrity protection on the app binary.** Out of scope for a local-only
  app with nothing to steal.
- **The dependency tree is the main residual risk.** No network permission
  limits the damage, but a malicious package could still corrupt data. Keep the
  dependency count low and run `npm audit` before release.

## Before shipping

- [ ] Confirm `INTERNET` is absent from the **release** manifest
- [ ] `npm audit`
- [ ] Test restore with a deliberately corrupted backup
- [ ] Test on a device with no biometrics enrolled
- [ ] Verify App Store privacy labels say no data collected
- [ ] Confirm the encrypted file is unreadable in a filesystem dump
