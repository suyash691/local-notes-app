#!/bin/bash
echo "Starting Notes App with Docker..."
echo

# Use whichever compose command is available
if docker compose version &>/dev/null; then
    DC="docker compose"
elif docker-compose version &>/dev/null; then
    DC="docker-compose"
else
    echo "Error: neither 'docker compose' nor 'docker-compose' found."
    exit 1
fi

if [ ! -d "data" ]; then
    echo "Creating data directory for database persistence..."
    mkdir -p data
fi

echo "Starting containers..."
$DC up --build -d

echo
echo "Checking container status..."
$DC ps

echo
echo "==========================================="
echo " Notes App is running!"
echo " Open your browser and go to:"
echo " http://localhost:3000"
echo
echo " Your database is stored in: ./data/notes.db"
echo
echo " To stop the app, run: $DC down"
echo " To view logs, run: $DC logs -f"
echo "==========================================="
echo
