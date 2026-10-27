param([string]$SpeechHome = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EveryHint\speech'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$cmakeCommand = Get-Command cmake -ErrorAction SilentlyContinue
$cmakeExecutable = if ($cmakeCommand) { $cmakeCommand.Source } else { $null }
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not $cmakeExecutable -and (Test-Path -LiteralPath $vswhere)) {
  $cmakeExecutable = & $vswhere -latest -products '*' -find 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe' | Select-Object -First 1
}
if (-not $cmakeExecutable) { throw 'Install Visual Studio C++ Build Tools with CMake, or put CMake on PATH.' }
$buildDirectory = Join-Path $SpeechHome 'build'
$runtimeDirectory = Join-Path $SpeechHome 'runtime'
New-Item -ItemType Directory -Force -Path $buildDirectory,$runtimeDirectory | Out-Null
# Source revision is pinned in CMakeLists.txt; this step downloads source, never a model.
$architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'ARM64' } else { 'x64' }
& $cmakeExecutable --fresh -S (Join-Path $projectRoot 'native\transcriber') -B $buildDirectory -A $architecture
if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed.' }
& $cmakeExecutable --build $buildDirectory --config Release --target everyhint-transcriber --parallel 4
if ($LASTEXITCODE -ne 0) { throw 'Native helper build failed.' }
& $cmakeExecutable --install $buildDirectory --config Release --prefix $runtimeDirectory --component EveryHint
if ($LASTEXITCODE -ne 0) { throw 'Native helper installation failed.' }
Write-Output "EveryHint runtime installed at $runtimeDirectory"
