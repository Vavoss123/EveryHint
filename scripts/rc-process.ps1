param([Parameter(Mandatory=$true)][int]$RootProcessId, [switch]$Affinity)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($RootProcessId -le 0) { throw 'Expected a positive owned process ID.' }
if ($Affinity) {
  Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class EveryHintAffinity {
  public delegate bool Visit(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] static extern bool EnumWindows(Visit callback, IntPtr parameter);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr window, StringBuilder title, int size);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int size);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool GetWindowDisplayAffinity(IntPtr window, out uint affinity);
  public static IntPtr Find(int process) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((window, parameter) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner != process) return true;
      var title = new StringBuilder(256); GetWindowText(window, title, title.Capacity);
      var kind = new StringBuilder(256); GetClassName(window, kind, kind.Capacity);
      if (title.ToString() != "EveryHint" || kind.ToString() != "Chrome_WidgetWin_1") return true;
      found = window; return false;
    }, IntPtr.Zero);
    return found;
  }
  public static bool Visible(IntPtr window) { return IsWindowVisible(window); }
}
'@
  $windowHandle = [EveryHintAffinity]::Find($RootProcessId)
  for ($attempt=0; $attempt -lt 30 -and $windowHandle -eq 0; $attempt++) {
    Start-Sleep -Milliseconds 100
    $windowHandle = [EveryHintAffinity]::Find($RootProcessId)
  }
  [uint32]$affinityValue = 0
  $success = [EveryHintAffinity]::GetWindowDisplayAffinity($windowHandle, [ref]$affinityValue)
  $nativeError = if ($success) { 0 } else { [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
  [pscustomobject]@{ success=$success; affinity=$affinityValue; windowFound=($windowHandle -ne 0); visible=[EveryHintAffinity]::Visible($windowHandle); error=$nativeError } | ConvertTo-Json -Compress
  exit
}
$processes = @(Get-CimInstance Win32_Process)
$owned = New-Object 'System.Collections.Generic.HashSet[int]'
$owned.Add($RootProcessId) | Out-Null
do {
  $changed = $false
  foreach ($process in $processes) {
    if ($owned.Contains([int]$process.ParentProcessId) -and -not $owned.Contains([int]$process.ProcessId)) {
      $owned.Add([int]$process.ProcessId) | Out-Null
      $changed = $true
    }
  }
} while ($changed)
@($processes | Where-Object { $owned.Contains([int]$_.ProcessId) } | ForEach-Object {
  [pscustomobject]@{ pid=$_.ProcessId; parent=$_.ParentProcessId; name=$_.Name;
    created=$_.CreationDate.ToUniversalTime().ToString('o'); workingSet=[double]$_.WorkingSetSize;
    cpuTicks=([double]$_.KernelModeTime + [double]$_.UserModeTime) }
}) | ConvertTo-Json -Compress
