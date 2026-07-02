; ─────────────────────────────────────────────────────────────────────────────
; Inno Setup script for HyperLinkNotes — builds a Windows installer (.exe) like
; Obsidian's: a no-admin, per-user install with Start-Menu + optional desktop
; shortcuts and a proper uninstaller.
;
; ONE-TIME SETUP:
;   1. Install Inno Setup 6 (free): https://jrsoftware.org/isdl.php
;   2. Make sure the app has been deployed to ..\dist\HyperLinkNotes
;      (run packaging\build_release.ps1, or the steps in packaging\README.md).
;
; BUILD THE INSTALLER:
;   • Open this file in the Inno Setup Compiler and press F9, OR
;   • Run from a terminal:
;       & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
;
; OUTPUT: packaging\output\HyperLinkNotes-Setup.exe
; ─────────────────────────────────────────────────────────────────────────────

#define AppName "HyperLinkNotes"
#define AppVersion "0.1.0"
#define AppPublisher "HyperLinkNotes"
#define AppExe "HyperLinkNotes.exe"

[Setup]
; A fixed GUID identifies the app for upgrades/uninstall — keep it constant.
AppId={{B2E7A6C4-4E8F-4C2A-9E3D-1A2B3C4D5E6F}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Per-user install — no administrator prompt, exactly like Obsidian.
PrivilegesRequired=lowest
OutputDir=output
OutputBaseFilename={#AppName}-Setup
SetupIconFile=appicon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; The entire self-contained deploy folder (exe + Qt DLLs + plugins + runtime).
Source: "..\dist\HyperLinkNotes\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent
