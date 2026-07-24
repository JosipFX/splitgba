; Inno-Setup-Script fuer den SplitGBA-Windows-Installer.
; Aufruf aus dem Repo-Root: ISCC /DMyAppVersion=<version> packaging\windows\installer.iss

#ifndef MyAppVersion
#define MyAppVersion "0.0.0"
#endif

[Setup]
AppName=SplitGBA
AppVersion={#MyAppVersion}
AppPublisher=Josip Corkovic
AppPublisherURL=https://github.com/JosipFX/splitgba
AppSupportURL=https://github.com/JosipFX/splitgba
DefaultDirName={autopf}\SplitGBA
DefaultGroupName=SplitGBA
DisableProgramGroupPage=yes
OutputDir=..\..\dist
OutputBaseFilename=SplitGBA-{#MyAppVersion}-windows-setup
SetupIconFile=..\icons\icon.ico
UninstallDisplayIcon={app}\splitgba.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\build-release\splitgba.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.de.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\SplitGBA"; Filename: "{app}\splitgba.exe"
Name: "{autodesktop}\SplitGBA"; Filename: "{app}\splitgba.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Run]
Filename: "{app}\splitgba.exe"; Description: "SplitGBA starten"; Flags: nowait postinstall skipifsilent
