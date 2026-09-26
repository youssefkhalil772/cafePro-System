Add-Type @'
  using System;
  using System.Runtime.InteropServices;
  public class Win32 {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  }
'@

Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.MainWindowHandle -ne [IntPtr]::Zero) {
    [Win32]::ShowWindow($_.MainWindowHandle, 3)
    [Win32]::SetForegroundWindow($_.MainWindowHandle)
    Write-Host "Foregrounded PID $($_.Id)"
  }
}
