$wsh = New-Object -ComObject WScript.Shell
$desktopPath = [System.Environment]::GetFolderPath('Desktop')

# 1. Desktop shortcut: CafePro POS.lnk
$sc1 = $wsh.CreateShortcut("$desktopPath\CafePro POS.lnk")
$sc1.TargetPath = "$desktopPath\تشغيل_كافيه_برو.bat"
$sc1.WorkingDirectory = "D:\CafePro System\photography-studio-system-main"
$sc1.IconLocation = "D:\CafePro System\photography-studio-system-main\assets\icon.ico"
$sc1.Description = "CafePro POS System - نظام كافيه برو"
$sc1.Save()

# 2. Desktop shortcut: كافيه برو.lnk
$sc2 = $wsh.CreateShortcut("$desktopPath\كافيه برو.lnk")
$sc2.TargetPath = "$desktopPath\تشغيل_كافيه_برو.bat"
$sc2.WorkingDirectory = "D:\CafePro System\photography-studio-system-main"
$sc2.IconLocation = "D:\CafePro System\photography-studio-system-main\assets\icon.ico"
$sc2.Description = "CafePro POS System - نظام كافيه برو"
$sc2.Save()

# 3. In root folder D:\CafePro System
$sc3 = $wsh.CreateShortcut("D:\CafePro System\CafePro POS.lnk")
$sc3.TargetPath = "D:\CafePro System\تشغيل_النظام.bat"
$sc3.WorkingDirectory = "D:\CafePro System\photography-studio-system-main"
$sc3.IconLocation = "D:\CafePro System\photography-studio-system-main\assets\icon.ico"
$sc3.Description = "CafePro POS System - نظام كافيه برو"
$sc3.Save()

Write-Host "Shortcuts created successfully with custom CafePro icon!"
