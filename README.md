# PopBar

Instant text actions for macOS, in the spirit of PopClip: **select text in any
app and a small toolbar appears next to it**, ready with the actions you use
most — cut, copy, paste, web search, translate, speak, open the link, email a
snippet, drop it in a new note, change the case, and whatever else you add
through extensions.

```
selected text ──▶ Accessibility (native helper) ──▶ PopBar bar ──▶ action
```

## Running it

```sh
cd PopBar
npm install      # also compiles the Accessibility helper (needs Xcode CLT)
npm start
```

The app lives in the menu bar (the selection-marquee icon) — there is no Dock
icon. The first time it starts, macOS asks for **Accessibility** permission:
System Settings → Privacy & Security → Accessibility → switch on **PopBar**
(when running from source the entry is called **Electron**). Until that is
granted the bar cannot see selections; the settings window says so.

Settings live under the menu-bar icon → *PopBar Settings…* (⌘,).

### Checking it without touching another app

```sh
POPBAR_DEBUG=1 npm start                 # show the bar for a made-up selection at the pointer
POPBAR_DEBUG=1 POPBAR_DEBUG_CLICK=1 npm start   # …and click Copy, printing the clipboard
POPBAR_DEBUG_SETTINGS=1 npm start        # open Settings and print what it rendered
```

`POPBAR_AX_DEBUG=1 native/bin/popbar-ax` prints what the helper sees in the
frontmost app, which is the quickest way to find out why an app does not
produce a bar.

### Building the app

```sh
npm run dist      # → .build/mac-arm64/PopBar.app
ditto .build/mac-arm64/PopBar.app ~/Applications/PopBar.app   # or copy it wherever you like
```

The output folder is `.build`, not `dist`, so Spotlight and Launchpad only ever
show the one installed copy — two bundles with the same name are confusing to
pick from and each needs its own Accessibility permission.

`PopBar.app` is menu-bar only (`LSUIElement`), has no Dock icon, and carries
its own copy of the Accessibility helper — no `npm start`, Node or project
folder needed to run it. The build is not signed with an Apple Developer ID,
so electron-builder leaves it unsigned and macOS refuses to launch arm64 apps
that way: sign it ad-hoc after building, then copy it.

```sh
codesign --force --deep --sign - dist/mac-arm64/PopBar.app
```

If a copy downloaded from elsewhere is "damaged", clear the quarantine flag
once: `xattr -cr ~/Applications/PopBar.app`. On first launch macOS asks for
Accessibility access again, because the permission belongs to the app bundle,
not to the folder it was built in.

## What is in the bar

| Action | What it does |
|---|---|
| Cut / Copy / Paste / Select All | The usual, without leaving the app you are in |
| Search Web | Opens the selection in Google |
| Translate | Opens the selection in Google Translate |
| Speak | Reads the selection with `say` |
| Open Link | Only shown when the selection is a URL — opens it |
| Email | New message with the text as the body |
| New Note | New Apple Notes note containing the text |
| UPPERCASE / lowercase / Capitalize | Puts the converted text on the clipboard |

Each one can be switched off in Settings; hover a button to see its name.

## Extension library

*Settings → Extension library* lists 31 ready-made actions in four groups
(Search, Links, Text, Developer): DuckDuckGo, Bing, YouTube, Amazon, Wikipedia,
GitHub, Stack Overflow, Maps, Spotify, Open in Browser, Shorten Link,
Dictionary, Add to Reminders, Title Case, Sentence case, Join Lines, Sort
Lines, Reverse Lines, Shuffle Lines, Blockquote, Bullet List, Comma List,
URL Encode/Decode, Base64 Encode/Decode, Slugify, ROT13, Word Count,
Format JSON and Strip Formatting.

Tick one to install and switch it on, untick to switch it off, ✕ to remove it
from disk. Each one is written as an ordinary extension folder you can edit in
`~/Library/Application Support/PopBar/Extensions/`.

### Importing a PopClip extension

*Settings → Import PopClip Extension…* accepts a `.popclipext` folder or a
`.popclipextz` / `.zip` file. `Config.json`, `Config.yaml` and `Config.plist`
are all understood. **Shell-script actions are converted**; AppleScript and
JavaScript actions are reported as skipped, since PopBar only runs shell
scripts. `requirements: [url]` becomes `"when": "url"`, `after: copy-result`
becomes `"after": "copy"`, and icons are mapped to the built-in set (or become
the extension's initials).

## History

Everything PopBar puts on the clipboard — Copy, Cut, Paste, the case actions,
extension results — is listed under the menu-bar icon → **History** (newest
first, 15 shown, 100 kept). Clicking an entry puts it back on the clipboard.
"Clear History" empties the list. It lives in
`~/Library/Application Support/PopBar/history.json`, capped at 100 entries and
20 000 characters each; identical consecutive copies collapse into one.

## Settings

- **Appearance** — bar height (26–80 px) with a live preview, labels either on
  hover above the icons or permanently under them, and dividers between icons
  (off, extra space, or a hairline). The preview is drawn from the bar's own
  stylesheet (`src/bar/appearance.css`) and icon set (`src/bar/icons.js`), so it
  cannot drift from the real bar. A bar that is already on screen adopts the
  new look immediately.
- **Actions** — on/off for every built-in and extension action, and their order:
  drag a row by its ⠿ handle, or use ↑ ↓.
- **Extension library** — 31 ready-made actions to add, switch off or remove.
- **Start at login** — adds PopBar to Login Items.
- **Minimum characters** — ignore very short selections.
- **Never appear in these apps** — name fragments, e.g. `1Password`.
- **Extensions** — import a PopClip extension, open the folder, reload.

## Extensions

An extension is a folder in `~/Library/Application Support/PopBar/Extensions/`
with a `Config.json`:

```json
{
  "name": "Search Wikipedia",
  "identifier": "com.popbar.example.wikipedia",
  "version": "1",
  "description": "Open the selected text in Wikipedia",
  "icon": "book",
  "actions": [
    {
      "title": "Wikipedia",
      "shell script": "open \"https://en.wikipedia.org/w/index.php?search=$POPCLIP_URLENCODED_TEXT\""
    }
  ]
}
```

- `shell script` replaces PopClip's `shell script` key: it runs with `/bin/bash`.
- Placeholders: `{popclip text}`, `{popclip text url-encoded}`, `{popclip app}`,
  `{popclip clipboard}` — shell-quoted for you. The same values arrive as
  `POPCLIP_TEXT`, `POPCLIP_URLENCODED_TEXT`, `POPCLIP_APP_NAME` and
  `POPCLIP_CLIPBOARD`, which is safer for awkward text.
- `"after": "copy"` puts the script's output on the clipboard instead of
  pasting over the selection — handy for transformations.
- `icon` is one of the built-in names (`cut`, `copy`, `paste`, `selectAll`,
  `search`, `translate`, `speak`, `openUrl`, `email`, `note`, `uppercase`,
  `lowercase`, `capitalize`, `puzzle`, `book`, `globe`, `terminal`) or one or
  two characters, e.g. `"🔎"` or `"W"`.
- Several actions in one `Config.json` give one extension several buttons.

Two worked examples are in `examples/`; *Settings → Add Example Extensions*
copies them into place.

## Files

| | |
|---|---|
| Settings, extensions, log | `~/Library/Application Support/PopBar/` |
| Native helper | `native/main.swift` → `native/bin/popbar-ax` |

## How it works

`native/main.swift` is a small Swift program that runs alongside the app. Every
120 ms it asks the Accessibility API for the focused UI element of the
frontmost app, reads `AXSelectedText` and the screen rectangle of the selection
(`AXBoundsForRange`), and prints a JSON line to stdout when the selection
changes. If an app does not publish selection bounds (web views, Electron
apps) PopBar falls back to the mouse position.

The Electron process turns each line into the bar window — a non-activating
panel, so clicking a button never takes focus away from the app you were
working in — and runs the chosen action. Actions that must type into the app
(cut, paste, select all) go back through the helper, which re-activates the
source app first and then posts the key event.

The helper is the only component that needs the Accessibility permission.

### When something does not work

`~/Library/Application Support/PopBar/popbar.log` records what the app actually
did: `start`, `trust granted/missing`, every `selection`, `bar-shown`,
`bar-click <action>`, `action-run`, extension output and errors. A bar that
never appears is a `trust missing`; a click that never reaches the app leaves
no `bar-click` line.

**Every rebuild is a new app identity**, so macOS drops the Accessibility
grant: after installing a new build, remove the old PopBar entry from
System Settings → Privacy & Security → Accessibility and add the new one.
Signing with a stable Developer ID (or a self-signed certificate) is the only
way to avoid that.

## Limits

- macOS only; there is no Windows or iOS version (same as PopClip).
- The Mac App Store is not an option for this design — it needs Accessibility
  and a background helper, so this is a standalone app.
- Apps that do not expose their text through Accessibility (some Electron
  apps, password fields) show nothing, or the bar appears at the mouse.

## Building

```bash
./scripts/build-app.sh
```

This builds the app, signs it with the persistent self-signed identity
"PopBar Self-Signed", and installs it to `/Applications`. Use it instead of
ad-hoc signing.

### Why a signing identity

An ad-hoc signature (`codesign --sign -`) hashes the whole binary, so every
rebuild looks like a different app to macOS and the Accessibility permission is
discarded each time. Signing with a fixed certificate keeps the designated
requirement constant:

    identifier "com.popbar.app" and certificate root = H"dc15c7f3…"

TCC matches that requirement, so the grant survives rebuilds. The identity and
its keychain (`~/Library/Keychains/popbar-signing.keychain-db`) are created once
by `scripts/signing-setup.sh`, which `build-app.sh` calls when needed. The
keychain password is generated and kept in `.signing/` (mode 600, git-ignored)
so signing never raises a password dialog.

Grant Accessibility once after the first signed build. Rebuilds do not need it
again. If the identity is ever deleted, a new one is created and one re-grant is
required.

## Windows

The app is Electron and runs on both platforms. Only the selection helper
differs, because the two systems expose selections differently:

| | macOS | Windows |
| --- | --- | --- |
| Helper | `native/main.swift`, built to `native/bin/popbar-ax` | `native/windows/popbar-win.ps1` |
| Notices a drag | Accessibility event tap | low-level mouse hook (`WH_MOUSE_LL`) |
| Reads the selection | Accessibility (`AXSelectedText`) | UI Automation `TextPattern`, then a Ctrl+C fallback |
| Permission | Accessibility grant | none |
| Keys (cut/paste/select all) | `CGEvent` | `keybd_event` |

```
npm install
npm start          # runs from source
npm run dist:win   # NSIS installer in .build/
```

Windows needs no compiler or SDK: the helper's small C# pieces are compiled at
start-up with `Add-Type`, using the PowerShell that ships with Windows. The
helper speaks the same JSON-lines protocol as the macOS one, so the app has a
single code path: heartbeats, clicks, selections and key requests.

Extension actions declare the shell they are written for (`"shell":
"powershell"` in `Config.json`). On Windows, bash ones are skipped and logged as
`extension-skipped` instead of appearing in the bar and failing on every click.
The bundled action library is written for bash, so on Windows the built-in
actions are what you get: Copy, Cut, Paste, Select All, Open Link, Search,
Email, UPPERCASE/lowercase/Capitalize and Speak.
