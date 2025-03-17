@echo off
REM Run script for Message Hub application
REM Usage: run.bat [start|stop|restart|status|logs|build]

setlocal EnableDelayedExpansion

REM Configuration (modify these variables as needed)
set COMPOSE_FILE=docker-compose.yml
set ENV_FILE=.env

REM Check if Docker is installed
where docker >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Docker is not installed.
    echo Please install Docker and Docker Compose before running this script.
    exit /b 1
)

REM Check if Docker Compose is installed
where docker-compose >nul 2>&1
if %ERRORLEVEL% neq 0 (
    REM Try docker compose (with space)
    docker compose version >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo Error: Docker Compose is not installed.
        echo Please install Docker Compose before running this script.
        exit /b 1
    )
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

REM Create .env file if it doesn't exist
if not exist "%ENV_FILE%" (
    echo Creating .env file with default values...
    (
        echo # Message Hub Environment Configuration
        echo.
        echo # JWT Authentication
        echo JWT_SECRET=message-hub-jwt-secret-key-change-in-production
        echo JWT_EXPIRATION=24h
        echo JWT_REFRESH_EXPIRATION=7d
        echo.
        echo # Encryption
        echo ENCRYPT_MESSAGES=true
        echo ENCRYPTION_KEY=01234567890123456789012345678901
        echo.
        echo # Kafka Configuration
        echo KAFKA_BROKERS=kafka:9092
        echo KAFKA_CLIENT_ID=message-hub
        echo KAFKA_AUTO_CREATE_TOPICS=true
        echo.
        echo # RabbitMQ Configuration
        echo RABBITMQ_HOST=rabbitmq
        echo RABBITMQ_PORT=5672
        echo RABBITMQ_USERNAME=message-hub
        echo RABBITMQ_PASSWORD=message-hub-password
        echo RABBITMQ_VHOST=/
        echo.
        echo # WebSocket Configuration
        echo WEBSOCKET_PATH=/ws
        echo WEBSOCKET_AUTH_REQUIRED=false
        echo.
        echo # CORS and Security
        echo ALLOWED_ORIGINS=http://localhost:8080
        echo ALLOWED_WEBSOCKET_ORIGINS=http://localhost:8080
        echo RATE_LIMIT_MAX=100
        echo.
        echo # Logging
        echo LOG_LEVEL=info
        echo LOG_TO_FILE=true
        echo.
        echo # Application
        echo SERVICE_NAME=message-hub
        echo NODE_ENV=production
        echo PORT=3000
    ) > "%ENV_FILE%"
    echo .env file created successfully.
    echo Please review and update the values as needed.
)

REM Function to start the application
:start_app
    echo Starting Message Hub application...
    %COMPOSE_CMD% -f %COMPOSE_FILE% up -d

    if %ERRORLEVEL% equ 0 (
        echo Message Hub application started successfully.
        echo Frontend UI: http://localhost:8080
        echo Backend API: http://localhost:3000
        echo API Documentation: http://localhost:3000/api-docs
        echo Kafka UI: http://localhost:8090
        echo RabbitMQ Management UI: http://localhost:15672
        echo Prometheus: http://localhost:9090
        echo Grafana: http://localhost:3001 (admin/admin)
    ) else (
        echo Failed to start Message Hub application.
        echo Check logs for more details: run.bat logs
    )
    exit /b 0

REM Function to stop the application
:stop_app
    echo Stopping Message Hub application...
    %COMPOSE_CMD% -f %COMPOSE_FILE% down

    if %ERRORLEVEL% equ 0 (
        echo Message Hub application stopped successfully.
    ) else (
        echo Failed to stop Message Hub application.
    )
    exit /b 0

REM Function to restart the application
:restart_app
    echo Restarting Message Hub application...
    %COMPOSE_CMD% -f %COMPOSE_FILE% restart

    if %ERRORLEVEL% equ 0 (
        echo Message Hub application restarted successfully.
    ) else (
        echo Failed to restart Message Hub application.
    )
    exit /b 0

REM Function to check the status of the application
:check_status
    echo Checking Message Hub application status...
    %COMPOSE_CMD% -f %COMPOSE_FILE% ps
    exit /b 0

REM Function to view logs
:view_logs
    if "%2"=="" (
        echo Viewing logs for all services...
        %COMPOSE_CMD% -f %COMPOSE_FILE% logs --tail=100 -f
    ) else (
        echo Viewing logs for %2 service...
        %COMPOSE_CMD% -f %COMPOSE_FILE% logs --tail=100 -f %2
    )
    exit /b 0

REM Function to build the application
:build_app
    echo Building Message Hub application...
    %COMPOSE_CMD% -f %COMPOSE_FILE% build

    if %ERRORLEVEL% equ 0 (
        echo Message Hub application built successfully.
    ) else (
        echo Failed to build Message Hub application.
    )
    exit /b 0

REM Main script logic
if "%1"=="start" goto start_app
if "%1"=="stop" goto stop_app
if "%1"=="restart" goto restart_app
if "%1"=="status" goto check_status
if "%1"=="logs" goto view_logs
if "%1"=="build" goto build_app

REM Show help if no valid command is provided
echo Message Hub Application Management Script
echo Usage: %0 [command]
echo Commands:
echo   start    - Start the application
echo   stop     - Stop the application
echo   restart  - Restart the application
echo   status   - Check application status
echo   logs     - View logs (use: %0 logs [service_name])
echo   build    - Build the application

exit /b 0