; NSIS hooks for Semblance installer/uninstaller
; Ensures clean install: kills running processes and clears stale data

!macro NSIS_HOOK_PREINSTALL
  ; Kill running Semblance app
  nsExec::ExecToLog 'taskkill /F /IM semblance-desktop.exe'
  ; Kill any node.exe sidecar processes
  nsExec::ExecToLog 'taskkill /F /IM node.exe /FI "WINDOWTITLE eq Semblance*"'
  nsExec::ExecToLog 'wmic process where "CommandLine like ''%semblance%bridge.cjs%''" call terminate'
  ; Give processes time to exit
  Sleep 1500
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
  ; Kill any node.exe sidecar processes
  nsExec::ExecToLog 'taskkill /F /IM node.exe /FI "WINDOWTITLE eq Semblance*"'
  nsExec::ExecToLog 'wmic process where "CommandLine like ''%semblance%bridge.cjs%''" call terminate'
  ; Give processes time to exit
  Sleep 1500
  ; Full cleanup on uninstall — remove all data including models
  RMDir /r "$PROFILE\.semblance"
!macroend
