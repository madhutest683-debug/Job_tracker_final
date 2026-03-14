@echo off
echo.
echo ==========================================
echo   Job Tracker -- Setup and Deploy
echo ==========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found.
    echo Download from: https://nodejs.org (choose LTS)
    echo Then run this script again.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODEVER=%%i
echo [OK] Node.js %NODEVER% found

echo.
echo Installing dependencies...
call npm install

where vercel >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo Installing Vercel CLI...
    call npm install -g vercel
)

echo.
echo Deploying to Vercel...
echo (Sign up / log in when prompted)
echo.
call vercel --prod

echo.
echo ==========================================
echo DONE! Your app is live.
echo.
echo TO INSTALL ON ANDROID:
echo   1. Open the URL above in Chrome on your phone
echo   2. Tap the 3-dot menu - Add to Home Screen
echo   3. Tap Add
echo ==========================================
echo.
pause
