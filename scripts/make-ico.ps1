Add-Type -AssemblyName System.Drawing
$pngPath = "D:\CafePro System\photography-studio-system-main\assets\icon.png"
$icoPath = "D:\CafePro System\photography-studio-system-main\assets\icon.ico"

$bmp = [System.Drawing.Bitmap]::FromFile($pngPath)
$thumb = New-Object System.Drawing.Bitmap($bmp, 256, 256)
$hIcon = $thumb.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$thumb.Dispose()
$bmp.Dispose()

Write-Host "Generated icon.ico successfully!"
