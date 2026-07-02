# Packaging HyperLinkNotes as a Windows app

This turns the Qt project into something any Windows PC can run without Qt
installed — a self-contained folder, a portable ZIP, and an installer.

## What's here

| File | Purpose |
|------|---------|
| `appicon.ico` | App icon (gold linked-nodes on slate) embedded in the exe |
| `app_icon.rc` | Windows resource that embeds `appicon.ico` (wired into `CMakeLists.txt`) |
| `build_release.ps1` | One command: Release build → bundle Qt → portable ZIP |
| `installer.iss` | Inno Setup script that builds the setup `.exe` |
| `output/` | Where the ZIP and the installer land |

## 1. Build the self-contained app

```powershell
powershell -ExecutionPolicy Bypass -File packaging\build_release.ps1
```

This produces:
- `dist\HyperLinkNotes\` — the app folder (`HyperLinkNotes.exe` + all Qt DLLs,
  plugins, and the MinGW runtime). Double-click the exe; it needs nothing else.
- `packaging\output\HyperLinkNotes-0.1.0-win64-portable.zip` — the same folder
  zipped. Anyone can unzip and run it. This is the "portable" distribution.

## 2. Build the installer (like Obsidian's setup wizard)

The installer gives users a real install: Start-Menu entry, optional desktop
shortcut, an uninstaller, and no admin prompt (per-user install).

1. Install **Inno Setup 6** (free): https://jrsoftware.org/isdl.php
2. Compile the script:
   ```powershell
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" packaging\installer.iss
   ```
   (or open `installer.iss` in the Inno Setup Compiler and press F9)
3. Result: `packaging\output\HyperLinkNotes-Setup.exe` — the file you'd put on a
   website or hand to someone.

## Updating the version

Bump `AppVersion` in `installer.iss` and the ZIP name in `build_release.ps1`
(and `project(... VERSION ...)` in `CMakeLists.txt`) when you cut a new build.

## Notes / gotchas

- **Release vs Debug.** The dev build is Debug (bigger, needs debug Qt libs).
  Distribution always uses the Release build these scripts produce.
- **windres + spaces.** The project path contains a space ("CODING PROJECTS"),
  which the Windows resource compiler can't pass as an include path. `CMakeLists.txt`
  works around it by stripping include dirs from the RC compile — don't remove that.
- **Signing.** The exe/installer are unsigned, so Windows SmartScreen will show a
  "unknown publisher" warning on first run. Buying a code-signing certificate and
  signing `HyperLinkNotes.exe` + the setup removes it (optional, ~yearly cost).
