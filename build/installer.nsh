!include nsDialogs.nsh
!include LogicLib.nsh

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
  Var EveryHintDesktopChoice
  Var EveryHintDesktopChecked
  !macro customPageAfterChangeDir
    Page custom EveryHintOptions EveryHintOptionsLeave
  !macroend
  Function EveryHintOptions
    ${If} ${Silent}
      Abort
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 32u "Install EveryHint for your Windows account. Local history and speech models are preserved during upgrades and uninstall."
    Pop $0
    ${NSD_CreateCheckbox} 0 44u 100% 14u "Create a desktop shortcut"
    Pop $EveryHintDesktopChoice
    ${NSD_Uncheck} $EveryHintDesktopChoice
    nsDialogs::Show
  FunctionEnd
  Function EveryHintOptionsLeave
    ${NSD_GetState} $EveryHintDesktopChoice $EveryHintDesktopChecked
  FunctionEnd
  !macro customInstall
    ${If} $EveryHintDesktopChecked == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\EveryHint.lnk" "$INSTDIR\EveryHint.exe" "" "$INSTDIR\EveryHint.exe" 0
    ${EndIf}
  !macroend
!else
  !macro customUnInstall
    Delete "$DESKTOP\EveryHint.lnk"
  !macroend
!endif
