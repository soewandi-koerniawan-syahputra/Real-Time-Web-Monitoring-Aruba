@echo off
cd /d D:\Project\test\backend

:loop
echo Running Aruba fetcher at %time%
python aruba_user_fetcher.py
timeout /t 30 >nul
goto loop
