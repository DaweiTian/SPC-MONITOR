; NSIS Installer Hooks for FT1-MONITOR
; See: https://v2.tauri.app/distribute/windows-installer/#extending-the-installer

!macro NSIS_HOOK_PREINSTALL
  ; Kill ft1-backend.exe if still running from a previous installation.
  ; This prevents "Error opening file for writing" when upgrading.
  DetailPrint "检查后端服务 ft1-backend.exe..."
  nsExec::ExecToStack 'taskkill /F /IM ft1-backend.exe'
  Pop $0
  Pop $1
  ${If} $0 == 0
    DetailPrint "已停止后端服务 ft1-backend.exe"
    ; Wait for the process to fully exit and release file locks
    Sleep 2000
  ${EndIf}

  ; Also kill any orphan uvicorn/python processes on port 18080
  DetailPrint "检查端口 18080..."
  nsExec::ExecToStack 'cmd /c "for /f "tokens=5" %a in (''netstat -ano ^| findstr :18080 ^| findstr LISTENING'') do taskkill /F /PID %a"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    DetailPrint "已释放端口 18080"
    Sleep 500
  ${EndIf}
!macroend
