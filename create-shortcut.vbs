' Crea un acceso directo en el Escritorio que apunta a start-prod.bat en esta misma carpeta
Dim shell, fso, projDir, batPath, desktop, lnk
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = projDir & "\\start-prod.bat"
desktop = shell.SpecialFolders("Desktop")
Set lnk = shell.CreateShortcut(desktop & "\\San Agustin - Iniciar Produccion.lnk")
lnk.TargetPath = batPath
lnk.WorkingDirectory = projDir
lnk.WindowStyle = 1
lnk.Description = "Iniciar sistema San Agustin (produccion local)"
lnk.Save
WScript.Echo "Acceso directo creado en el Escritorio."
