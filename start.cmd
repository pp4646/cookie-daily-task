@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 綁定 127.0.0.1（只給本機用），這樣 Windows 防火牆就不會跳出詢問視窗。
rem 公司電腦如果不允許「公用/私人網路存取」，用這個方式一樣可以正常開發。

set PORT=8000

echo.
echo   Cookie 的每日挑戰 - 本機預覽
echo   ------------------------------
echo   網址：http://localhost:%PORT%
echo   要停止請按 Ctrl+C 或直接關掉這個視窗
echo.

start "" "http://localhost:%PORT%"
python -m http.server %PORT% --bind 127.0.0.1
