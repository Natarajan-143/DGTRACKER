@echo off
echo ==============================================
echo Starting DG Tracker Demo Servers...
echo ==============================================

:: Start the backend API server in a separate window
echo Launching Backend Server on port 5000...
start "DG Tracker Backend" cmd /k "npm run dev-backend"

:: Wait 3 seconds for backend to initialize database
timeout /t 3 /nobreak > NUL

:: Start the frontend server in a separate window
echo Launching Frontend Server on port 3000...
start "DG Tracker Frontend" cmd /k "npm run dev-frontend"

:: Wait 2 seconds for frontend to start
timeout /t 2 /nobreak > NUL

:: Open browser
echo Opening http://localhost:3000/ in browser...
start http://localhost:3000/

echo ==============================================
echo Application running!
echo You can close this window. Keep the other two server windows open.
echo ==============================================
pause
