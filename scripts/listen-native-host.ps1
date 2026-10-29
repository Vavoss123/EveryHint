$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ListenHostNative {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
}
'@
$form = New-Object System.Windows.Forms.Form
$form.Text = 'EveryHint harmless hotkey fixture'
$form.Width = 680
$form.Height = 320
$form.StartPosition = 'CenterScreen'
$text = New-Object System.Windows.Forms.TextBox
$text.Multiline = $true
$text.Dock = 'Fill'
$text.Font = New-Object System.Drawing.Font('Consolas', 15)
$text.Text = "EveryHint owned Windows fixture. No user material.`r`n`r`nfunction double(value) {`r`n  return value * 2;`r`n}"
$form.Controls.Add($text)
$form.Add_Shown({
  $null = [ListenHostNative]::ShowWindow($form.Handle, 5)
  $form.Activate()
  $text.Focus()
  [Console]::WriteLine((@{ handle = $form.Handle.ToInt64(); process = $PID; application = 'Windows Forms in a separate PowerShell process' } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
})
[System.Windows.Forms.Application]::Run($form)
