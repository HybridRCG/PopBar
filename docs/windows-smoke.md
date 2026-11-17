# Windows smoke test

Nothing on this list has ever been run: the installer, the PowerShell helper and
the update path were built on macOS and shipped unverified. Work down the list on
a clean Windows 10 or 11 VM, and record the version and date at the top.

Version tested: __________  Date: __________  VM: __________

## Install

1. Download `PopBar-Setup-<version>.exe` from the releases page.
2. SmartScreen warns (unsigned): *More info → Run anyway*.
3. Installer runs one-click, per-user, no admin prompt. **Expected:** no UAC.
4. PopBar appears in the notification area (tray), not the taskbar.

## Selection and the bar

5. Open Notepad, type a sentence, select it with the mouse.
   **Expected:** the bar appears next to the selection within ~300 ms.
6. Click **Copy**. **Expected:** the bar hides, the text is on the clipboard,
   the app you copied from keeps focus.
7. Select text in Chrome, then in Excel, then in Explorer's address bar.
   **Expected:** a bar in all three.
8. Open a password field (e.g. a bank login page) and select inside it.
   **Expected:** no bar, ever. Then right-click → Copy still works (PopBar must
   not break the user's own copying).
9. Drag-select across two lines quickly. **Expected:** one bar, not two.

## Actions

10. **Cut**, **Paste**, **Select All** from the bar: text changes in the source
    app, which is re-activated first.
11. **Search Web**, **Translate**, **Speak**: the default browser/voice opens.
12. **UPPERCASE / lowercase / Capitalize**: the selection is replaced in place.
13. Settings → Actions: turn one off, confirm it leaves the bar without a restart.

## Update

14. With `<version>` installed and a newer release published, wait ~10 s after
    launch. **Expected:** a notification, then the installer downloads
    (`%LOCALAPPDATA%\popbar-updater`), then *Restart to Update* installs it.
15. Kill the network, restart PopBar. **Expected:** one `update-error` log line,
    no dialog, no crash.
16. After updating, check the log has `update-none` (not `update-blocked`).

## Failures to look for

- A PowerShell console window flashing at any point.
- `helper-exit kind=startup-failure` repeating in
  `%APPDATA%\PopBar\popbar.log` — that is the helper script failing to parse.
- The bar appearing in the wrong place on a high-DPI display or a second monitor.
- The tray icon missing or blank (Windows tray icons are per-size PNGs).

Log: `%APPDATA%\PopBar\popbar.log`. Attach the last 60 lines to any report;
*Diagnostics → Copy Diagnostics* produces the same summary as on macOS.
