@echo off
echo Starting Notes App with Docker...
echo.

REM Create data directory if it doesn't exist
if not exist "data" (
    echo Creating data directory for database persistence...
    mkdir data
)

REM Start the application
echo Starting containers...
docker-compose up -d

REM Show status
echo.
echo Checking container status...
docker-compose ps

echo.
echo ===========================================
echo  Notes App is running!
echo  Open your browser and go to:
echo  http://localhost:3000
echo.
echo  Your database is stored in: .\data\notes.db
echo.
echo  To stop the app, run: docker-compose down
echo  To view logs, run: docker-compose logs -f
echo ===========================================
echo.