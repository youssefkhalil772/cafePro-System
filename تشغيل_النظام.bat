@echo off
title CafePro POS System
chcp 65001 >nul
cd /d "%~dp0"

echo ===================================================
echo     تشغيل نظام كافيه برو - CafePro POS System
echo ===================================================
echo جاري فتح شاشة النظام...

call .\node_modules\.bin\electron.cmd .
if errorlevel 1 (
    echo.
    echo حدث خطأ أثناء تشغيل النظام. يرجى مراجعة الرسالة أعلاه.
    pause
)
