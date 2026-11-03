param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\artifacts\release-vc-runtime'))
$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$source = $null
if ($env:EVERYHINT_VC_REDIST_DIR) {
  $source = Join-Path $env:EVERYHINT_VC_REDIST_DIR 'vcruntime140.dll'
} elseif (Test-Path -LiteralPath $vswhere) {
  $source = & $vswhere -latest -products '*' -find 'VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT\vcruntime140.dll' | Select-Object -Last 1
}
if (-not $source -or -not (Test-Path -LiteralPath $source)) {
  throw 'Install the Visual Studio C++ x64 Redistributable build component, or set EVERYHINT_VC_REDIST_DIR to its release x64 CRT directory.'
}
$source = (Resolve-Path -LiteralPath $source).Path
$signature = Get-AuthenticodeSignature -LiteralPath $source
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
  throw 'The app-local VC runtime must have a valid Microsoft signature.'
}
$bytes = [System.IO.File]::ReadAllBytes($source)
$pe = [BitConverter]::ToInt32($bytes, 0x3c)
if ([BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664) { throw 'The app-local VC runtime must be x64.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$target = Join-Path $OutputDirectory 'vcruntime140.dll'
Copy-Item -LiteralPath $source -Destination $target -Force
$manifest = @{
  schema = 1
  file = 'vcruntime140.dll'
  version = (Get-Item -LiteralPath $source).VersionInfo.FileVersion
  sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  signer = $signature.SignerCertificate.Subject
  license = 'https://visualstudio.microsoft.com/license-terms/vs2026-ga-visualcpp-v14-redist-runtime/'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'manifest.json') -Encoding UTF8
Write-Output "Prepared signed x64 vcruntime140.dll $($manifest.version) for the native credential module."
