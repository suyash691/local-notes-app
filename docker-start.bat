@echo off
echo Starting Notes App with Docker...
echo.

REM Detect which compose command works
docker compose version >nul 2>&1
if %errorlevel%==0 (
    set DC=docker compose
) else (
    docker-compose version >nul 2>&1
    if %errorlevel%==0 (
        set DC=docker-compose
    ) else (
        echo Error: neither 'docker compose' nor 'docker-compose' found.
        exit /b 1
    )
)

if not exist "data" (
    echo Creating data directory for database persistence...
    mkdir data
)

echo Starting containers...
%DC% up --build -d

echo.
echo Checking container status...
%DC% ps

echo.
echo ===========================================
echo  Notes App is running!
echo  Open your browser and go to:
echo  http://localhost:3000
echo.
echo  Your database is stored in: .\data\notes.db
echo.
echo  To stop the app, run: %DC% down
echo  To view logs, run: %DC% logs -f
echo ===========================================
echo.
