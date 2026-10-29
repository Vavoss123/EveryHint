param([ValidateSet('Inspect','Shortcut','Dialog')][string]$Action, [long]$Handle = 0, [string]$Accelerator, [int]$OwnedProcess = 0, [string]$Button)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EveryHintUxNative {
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd, int index);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint command);
  [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr hwnd, out uint affinity);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
}
'@
if ($Action -eq 'Inspect') {
  $windowHandle = [IntPtr]$Handle
  $style = [EveryHintUxNative]::GetWindowLongPtr($windowHandle, -20).ToInt64()
  [uint32]$affinity = 0
  $affinityRead = [EveryHintUxNative]::GetWindowDisplayAffinity($windowHandle, [ref]$affinity)
  @{ topmost = ($style -band 8) -ne 0; toolWindow = ($style -band 128) -ne 0; appWindow = ($style -band 262144) -ne 0; noActivate = ($style -band 134217728) -ne 0; owner = [EveryHintUxNative]::GetWindow($windowHandle, 4).ToInt64(); affinity = $affinity; affinityRead = $affinityRead } | ConvertTo-Json -Compress
} elseif ($Action -eq 'Shortcut') {
  $keys = @()
  foreach ($part in $Accelerator.Split('+')) {
    if ($part -eq 'Control') { $keys += [byte]17 }
    elseif ($part -eq 'Alt') { $keys += [byte]18 }
    elseif ($part -eq 'Shift') { $keys += [byte]16 }
    elseif ($part -eq 'Space') { $keys += [byte]32 }
    elseif ($part -match '^[A-Z0-9]$') { $keys += [byte][char]$part }
    else { throw 'Unsupported test shortcut.' }
  }
  try {
    foreach ($key in $keys) { [EveryHintUxNative]::keybd_event($key, 0, 0, [UIntPtr]::Zero) }
  } finally {
    [array]::Reverse($keys)
    foreach ($key in $keys) { [EveryHintUxNative]::keybd_event($key, 0, 2, [UIntPtr]::Zero) }
  }
} else {
  Add-Type -AssemblyName UIAutomationClient
  $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $OwnedProcess)
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    foreach ($window in $windows) {
      $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($target in $elements) {
        if ($target.Current.Name.Trim() -ne $Button) { continue }
        $text = @($elements | ForEach-Object { $_.Current.Name } | Where-Object { $_ -in @('Your session is still open', 'Keep running in background', 'Stop and quit', 'Cancel') })
        [object]$pattern = $null
        if ($target.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
          ([System.Windows.Automation.InvokePattern]$pattern).Invoke()
        } elseif ($target.Current.NativeWindowHandle -ne 0) {
          $sent = [EveryHintUxNative]::PostMessage([IntPtr]$target.Current.NativeWindowHandle, 245, [IntPtr]::Zero, [IntPtr]::Zero)
          if (!$sent) { continue }
        } else { continue }
        @{ button = $Button; text = $text } | ConvertTo-Json -Compress
        exit 0
      }
    }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  $observed = @($windows | ForEach-Object { $_.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | ForEach-Object { $_.Current.Name } }) -join ' | '
  throw "Owned EveryHint dialog was not found. Observed: $observed"
}
