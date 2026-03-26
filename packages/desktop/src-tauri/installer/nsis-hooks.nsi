; NSIS hooks for Semblance installer/uninstaller
; Ensures clean install: kills running processes and clears stale data

!macro NSIS_HOOK_PREINSTALL
  ; Kill running Semblance app
  nsExec::ExecToLog 'taskkill /F /IM semblance-desktop.exe'
  ; Kill ALL node.exe processes running the Semblance sidecar (bridge.cjs)
  ; PowerShell is reliable on Windows 10/11 — wmic is deprecated
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''node.exe'' -and $_.CommandLine -match ''bridge\.cjs'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  ; Fallback: also try taskkill for any lingering node.exe with semblance in the path
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''node.exe'' -and $_.CommandLine -match ''semblance'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  ; Give processes time to exit
  Sleep 2000
  ; Clear previous session data for clean install
  ; Models are preserved (large downloads) — only runtime state is cleared
  RMDir /r "$PROFILE\.semblance\data"
  RMDir /r "$PROFILE\.semblance\prefs"
  Delete "$PROFILE\.semblance\.session-active"
  Delete "$PROFILE\.semblance\.last-verify"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Kill running Semblance app
  nsExec::ExecToLog 'taskkill /F /IM semblance-desktop.exe'
  ; Kill ALL node.exe processes running the Semblance sidecar
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''node.exe'' -and $_.CommandLine -match ''bridge\.cjs'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  nsExec::ExecToLog 'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''node.exe'' -and $_.CommandLine -match ''semblance'' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  ; Give processes time to fully release file locks
  Sleep 2500
  ; Full cleanup on uninstall — remove all user data including models, databases, prefs
  ; First attempt
  RMDir /r "$PROFILE\.semblance"
  ; If files were still locked, wait and retry
  IfFileExists "$PROFILE\.semblance\*.*" 0 semblance_cleanup_done
    Sleep 2000
    ; Kill any stragglers that respawned
    nsExec::ExecToLog 'powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -match ''semblance'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'
    Sleep 1000
    RMDir /r "$PROFILE\.semblance"
  semblance_cleanup_done:
!macroend
