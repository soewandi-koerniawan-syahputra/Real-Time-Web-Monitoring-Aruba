@echo off

REM Start backend
start cmd /k "cd /d D:\Project\test\backend && python app.py"

REM Start frontend
start cmd /k "cd /d D:\Project\test\frontend && npm start"
