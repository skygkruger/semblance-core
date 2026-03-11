; NSIS hooks for Semblance installer/uninstaller
; Kills stale node.exe sidecar processes before uninstall to release file locks

!macro NSIS_HOOK_PREUNINSTALL
  ; Kill any node.exe processes running from the Semblance install directory
  ; This prevents "file in use" errors during uninstall
  nsExec::ExecToLog 'taskkill /F /IM node.exe /FI "WINDOWTITLE eq Semblance*"'
  ; Also kill by matching the sidecar bridge.cjs in command line
  nsExec::ExecToLog 'wmic process where "CommandLine like ''%semblance%bridge.cjs%''" call terminate'
  ; Give processes time to exit
  Sleep 1000
!macroend
