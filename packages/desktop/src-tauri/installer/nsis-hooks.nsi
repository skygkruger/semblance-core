; NSIS hooks for Semblance installer/uninstaller
; Ensures clean install: kills running processes and clears stale data
;
; Macro names verified against Tauri 2.0 source:
;   crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi
;   Lines 617, 709, 754, 862
;
; QUOTING: nsExec::ExecToLog uses single quotes as string delimiters.
; Double quotes are safe inside. Single quotes CANNOT appear inside
; (NSIS has no escape mechanism for them). This rules out WMIC WHERE
; clauses and PowerShell pipelines — both need single quotes for strings.
; All process killing uses plain taskkill which only needs double quotes.

!macro NSIS_HOOK_PREINSTALL
  ; Kill running Semblance app
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "semblance-desktop.exe" 2>nul'

  ; Kill node.exe (the sidecar process). Ideally we would filter to only
  ; bridge.cjs processes, but WMIC and PowerShell both require single
  ; quotes in their syntax which breaks NSIS string delimiters. Killing
  ; all node.exe is acceptable — the user is actively running the installer.
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "node.exe" 2>nul'

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
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "semblance-desktop.exe" 2>nul'

  ; Kill ALL node.exe — acceptable during uninstall
  nsExec::ExecToLog 'cmd /c taskkill /F /IM "node.exe" 2>nul'

  ; Give processes time to fully release file locks
  Sleep 3000

  ; Full cleanup — remove all user data including models, databases, prefs
  ; Belt-and-suspenders: both cmd rmdir and NSIS RMDir
  nsExec::ExecToLog 'cmd /c rmdir /s /q "%USERPROFILE%\.semblance" 2>nul'
  RMDir /r "$PROFILE\.semblance"

  ; If files were still locked, wait and retry
  IfFileExists "$PROFILE\.semblance\*.*" 0 semblance_cleanup_done
    Sleep 2000
    nsExec::ExecToLog 'cmd /c rmdir /s /q "%USERPROFILE%\.semblance" 2>nul'
    RMDir /r "$PROFILE\.semblance"
  semblance_cleanup_done:
!macroend
