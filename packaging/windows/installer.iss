; Inno-Setup-Script fuer den SplitEmu-Windows-Installer.
; Aufruf aus dem Repo-Root: ISCC /DMyAppVersion=<version> packaging\windows\installer.iss

#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif

[Setup]
AppName=SplitEmu
AppVersion={#MyAppVersion}
AppPublisher=Josip Corkovic
AppPublisherURL=https://github.com/JosipFX/splitemu
AppSupportURL=https://github.com/JosipFX/splitemu
DefaultDirName={autopf}\SplitEmu
DefaultGroupName=SplitEmu
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=SplitEmu-{#MyAppVersion}-windows-setup
SetupIconFile=..\icons\icon.ico
UninstallDisplayIcon={app}\splitemu.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\build-release\splitemu.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.de.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\SplitEmu"; Filename: "{app}\splitemu.exe"
Name: "{autodesktop}\SplitEmu"; Filename: "{app}\splitemu.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Run]
Filename: "{app}\splitemu.exe"; Description: "SplitEmu starten"; Flags: nowait postinstall skipifsilent
