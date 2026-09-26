@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm.cmd start
if errorlevel 1 pause
