@echo off
echo ========================================
echo   Syncing VPNVorteXBot to GitHub...
echo ========================================
echo.

cd /d "%~dp0"

:: Check if git repo exists
if not exist ".git" (
    echo [ERROR] Git repository not initialized. Run setup_github.bat first.
    pause
    exit /b 1
)

:: Stage all changes
git add -A

:: Check if there are changes
git diff --cached --quiet
if %errorlevel%==0 (
    echo No changes to sync.
    pause
    exit /b 0
)

:: Commit with timestamp
for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value') do set datetime=%%a
set timestamp=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2% %datetime:~8,2%:%datetime:~10,2%:%datetime:~12,2%

git commit -m "Auto-sync: %timestamp%"

:: Push to GitHub
git push origin main

echo.
echo ========================================
echo   Sync complete!
echo ========================================
pause
