' Opens the missions map full-screen in Edge kiosk mode at login.
' The server itself runs as a Windows Service (started at boot), so this
' only waits for it to answer -- up to ~60s -- then launches Edge either way.
' Installed into the auto-login account's Startup folder by install-kiosk.ps1.
Dim shell, http, i, ready
Set shell = CreateObject("WScript.Shell")

ready = False
For i = 1 To 60
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.Open "GET", "http://localhost:5103/", False
    http.Send
    If Err.Number = 0 Then
        If http.Status = 200 Then ready = True
    End If
    Err.Clear
    On Error GoTo 0
    If ready Then Exit For
    WScript.Sleep 1000
Next

shell.Run "msedge.exe --kiosk http://localhost:5103/ --edge-kiosk-type=fullscreen --no-first-run --inprivate", 1, False
