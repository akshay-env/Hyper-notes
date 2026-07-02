# ─────────────────────────────────────────────────────────────────────────────
# Builds HyperLinkNotes in Release and produces a self-contained Windows app
# folder in dist\HyperLinkNotes (exe + every Qt DLL/plugin + MinGW runtime),
# then zips it as a portable distribution.
#
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File packaging\build_release.ps1
#
# Adjust these paths if your Qt install moves.
# ─────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$QtBin      = "D:\DevToolsData\QT\6.11.1\mingw_64\bin"
$MinGWBin   = "D:\DevToolsData\QT\Tools\mingw1310_64\bin"
$CMake      = "D:\DevToolsData\QT\Tools\CMake_64\bin\cmake.exe"
$QtPrefix   = "D:\DevToolsData\QT\6.11.1\mingw_64"

# Repo layout (this script lives in <proj>\packaging).
$Proj       = Split-Path $PSScriptRoot -Parent
$BuildDir   = "$Proj\build\release"
$Dist       = "$Proj\dist\HyperLinkNotes"
$OutDir     = "$PSScriptRoot\output"

$env:PATH = "$MinGWBin;$QtBin;$env:PATH"

Write-Host "==> Configuring Release..." -ForegroundColor Cyan
& $CMake -S $Proj -B $BuildDir -G "MinGW Makefiles" `
    -DCMAKE_BUILD_TYPE=Release `
    -DCMAKE_PREFIX_PATH=$QtPrefix `
    -DCMAKE_MAKE_PROGRAM="$MinGWBin\mingw32-make.exe"
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed" }

Write-Host "==> Building..." -ForegroundColor Cyan
& "$MinGWBin\mingw32-make.exe" -C $BuildDir -j4
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Write-Host "==> Deploying Qt dependencies..." -ForegroundColor Cyan
if (Test-Path $Dist) { Remove-Item -Recurse -Force $Dist }
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
Copy-Item "$BuildDir\appHyperLinkNotes.exe" "$Dist\HyperLinkNotes.exe"
& "$QtBin\windeployqt.exe" --release --compiler-runtime --no-translations --qmldir "$Proj\qml" "$Dist\HyperLinkNotes.exe"
if ($LASTEXITCODE -ne 0) { throw "windeployqt failed" }

Write-Host "==> Zipping portable build..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Zip = "$OutDir\HyperLinkNotes-0.1.0-win64-portable.zip"
if (Test-Path $Zip) { Remove-Item -Force $Zip }
Compress-Archive -Path "$Dist\*" -DestinationPath $Zip

$size = "{0:N1} MB" -f ((Get-ChildItem -Recurse $Dist | Measure-Object -Property Length -Sum).Sum / 1MB)
Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  Portable folder : $Dist  ($size)"
Write-Host "  Portable ZIP    : $Zip"
Write-Host "  Installer       : compile packaging\installer.iss with Inno Setup"
