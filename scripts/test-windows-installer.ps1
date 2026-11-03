# Real current-user install/reinstall/uninstall. Refuses to touch an existing
# EveryHint installation or shortcut. Run sequentially on a disposable host.
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -LiteralPath (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $project "release\EveryHint-Setup-$version.exe"
$artifacts = Join-Path $project 'artifacts'
$testRoot = Join-Path $artifacts ('installer-test-' + [Guid]::NewGuid().ToString('N'))
$target = Join-Path $testRoot 'EveryHint'
$uninstallRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
function InstalledEveryHint {
  foreach ($path in $uninstallRoots) {
    Get-ChildItem -LiteralPath $path -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -like 'EveryHint*' }
  }
}
$menuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'EveryHint.lnk'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'EveryHint.lnk'
if (@(InstalledEveryHint).Count -ne 0 -or (Get-Process EveryHint -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $menuLink) -or (Test-Path -LiteralPath $desktopLink)) {
  throw 'Use a clean test host: an existing EveryHint installation, process or shortcut is present.'
}
if (-not (Test-Path -LiteralPath $installer)) { throw 'Build the installer first.' }
New-Item -ItemType Directory -Path $testRoot | Out-Null
$checks = New-Object System.Collections.Generic.List[string]
$report = @{ version=$version; assertions=0; checks=$checks; silentInstall=$true; cleanVM=$false; installedDirectory=$target; completed=$false }
$installed = $false
$oldExecutable = $env:EVERYHINT_PACKAGED_EXE
function Check([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
  $checks.Add($message)
}
function InstallFixture {
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$target") -WindowStyle Hidden -PassThru -Wait
  Check ($process.ExitCode -eq 0) 'Installer exits successfully without elevation'
  Check (Test-Path -LiteralPath (Join-Path $target 'EveryHint.exe')) 'Installer writes the actual application executable'
}
try {
  # This flag also ensures cleanup is attempted if a partial install fails.
  $installed = $true
  InstallFixture
  $registered = @(InstalledEveryHint)
  Check ($registered.Count -eq 1 -and $registered[0].PSPath -like '*HKEY_CURRENT_USER*' -and $registered[0].DisplayVersion -eq $version) 'Exactly one current-user uninstall record has the correct version'
  Check ($registered[0].UninstallString.Contains((Join-Path $target 'Uninstall EveryHint.exe'))) 'Uninstall registration points only to the isolated test directory'
  Check (Test-Path -LiteralPath (Join-Path $target 'vcruntime140.dll')) 'Native credential runtime is installed beside the app'
  Check (Test-Path -LiteralPath (Join-Path $target 'resources\speech\everyhint-transcriber.exe')) 'Speech helper is installed'
  Check (Test-Path -LiteralPath $menuLink) 'Start menu shortcut is created'
  $shell = New-Object -ComObject WScript.Shell
  Check ($shell.CreateShortcut($menuLink).TargetPath -eq (Join-Path $target 'EveryHint.exe')) 'Start menu shortcut targets the installed application'
  $env:EVERYHINT_PACKAGED_EXE = Join-Path $target 'EveryHint.exe'
  $smoke = Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"' + (Join-Path $project 'scripts\smoke-packaged.mjs') + '"') -WorkingDirectory $project -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $testRoot 'smoke.log') -RedirectStandardError (Join-Path $testRoot 'smoke-error.log')
  if ($smoke.ExitCode -ne 0) { Get-Content -LiteralPath (Join-Path $testRoot 'smoke-error.log'); throw 'Installed application smoke failed.' }
  Check ($smoke.ExitCode -eq 0) 'Installed application passes the real packaged-renderer smoke'
  Copy-Item -LiteralPath (Join-Path $artifacts 'p11-packaged-smoke.json') -Destination (Join-Path $testRoot 'installed-app-smoke.json')
  InstallFixture
  Check (@(InstalledEveryHint).Count -eq 1) 'Reinstall updates the existing current-user registration without duplication'
  $report.completed = $true
} finally {
  $env:EVERYHINT_PACKAGED_EXE = $oldExecutable
  if ($installed) {
    # Verify the absolute removal target before invoking its native uninstaller.
    $resolvedTarget = [System.IO.Path]::GetFullPath($target)
    if (-not $resolvedTarget.StartsWith($artifacts + '\', [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $testRoot) -notlike 'installer-test-*') { throw 'Unsafe test uninstall target.' }
    $uninstaller = Join-Path $target 'Uninstall EveryHint.exe'
    if (Test-Path -LiteralPath $uninstaller) {
      $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
      $deadline = [DateTime]::UtcNow.AddSeconds(30)
      while ((Test-Path -LiteralPath (Join-Path $target 'EveryHint.exe')) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
      Check (-not (Test-Path -LiteralPath (Join-Path $target 'EveryHint.exe'))) 'Uninstaller removes the installed application'
      Check (@(InstalledEveryHint).Count -eq 0) 'Uninstaller removes its registration'
      Check (-not (Test-Path -LiteralPath $menuLink)) 'Uninstaller removes its Start menu shortcut'
      Check (-not (Test-Path -LiteralPath $desktopLink)) 'No test desktop shortcut remains'
    }
  }
  $report.assertions = $checks.Count
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $artifacts 'installer-lifecycle.json') -Encoding UTF8
}
Write-Output "Actual installer lifecycle passed: $($checks.Count) assertions, install/reinstall/installed launch/uninstall."
