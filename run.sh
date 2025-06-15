#!/bin/bash

# Run script for StreamBridge application
# Usage: ./run.sh [start|stop|restart|status|logs|build]

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration (modify these variables as needed)
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker and Docker Compose before running this script."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    # Try docker compose (with space)
    if ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed.${NC}"
        echo "Please install Docker Compose before running this script."
        exit 1
    fi
    # Use "docker compose" instead of "docker-compose"
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Create .env file if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Creating .env file with default values...${NC}"
    cat > "$ENV_FILE" << EOF
# StreamBridge Environment Configuration

# JWT Authentication
JWT_SECRET=streambridge-jwt-secret-key-change-in-production
JWT_EXPIRATION=24h
JWT_REFRESH_EXPIRATION=7d

# Encryption
ENCRYPT_MESSAGES=true
ENCRYPTION_KEY=01234567890123456789012345678901

# Kafka Configuration
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=streambridge
KAFKA_AUTO_CREATE_TOPICS=true

# RabbitMQ Configuration
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USERNAME=streambridge
RABBITMQ_PASSWORD=streambridge-password
RABBITMQ_VHOST=/

# WebSocket Configuration
WEBSOCKET_PATH=/ws
WEBSOCKET_AUTH_REQUIRED=false

# CORS and Security
ALLOWED_ORIGINS=http://localhost:8080
ALLOWED_WEBSOCKET_ORIGINS=http://localhost:8080
RATE_LIMIT_MAX=100

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true

# Application
SERVICE_NAME=streambridge
NODE_ENV=production
PORT=5045
EOF
    echo -e "${GREEN}.env file created successfully.${NC}"
    echo -e "${YELLOW}Please review and update the values as needed.${NC}"
fi

# Function to start the application
start_app() {
    echo -e "${BLUE}Starting StreamBridge application...${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE up -d

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}StreamBridge application started successfully.${NC}"
        echo -e "Frontend UI: ${BLUE}http://localhost:8080${NC}"
        echo -e "Backend API: ${BLUE}http://localhost:5045${NC}"
        echo -e "API Documentation: ${BLUE}http://localhost:5045/api-docs${NC}"
        echo -e "Kafka UI: ${BLUE}http://localhost:8090${NC}"
        echo -e "RabbitMQ Management UI: ${BLUE}http://localhost:15672${NC}"
        echo -e "Prometheus: ${BLUE}http://localhost:9091${NC}"
        echo -e "Grafana: ${BLUE}http://localhost:3001${NC} (admin/admin)"
    else
        echo -e "${RED}Failed to start StreamBridge application.${NC}"
        echo "Check logs for more details: ./run.sh logs"
    fi
}

# Function to stop the application
stop_app() {
    echo -e "${BLUE}Stopping StreamBridge application...${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE down

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}StreamBridge application stopped successfully.${NC}"
    else
        echo -e "${RED}Failed to stop StreamBridge application.${NC}"
    fi
}

# Function to restart the application
restart_app() {
    echo -e "${BLUE}Restarting StreamBridge application...${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE restart

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}StreamBridge application restarted successfully.${NC}"
    else
        echo -e "${RED}Failed to restart StreamBridge application.${NC}"
    fi
}

# Function to check the status of the application
check_status() {
    echo -e "${BLUE}Checking StreamBridge application status...${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE ps
}

# Function to view logs
view_logs() {
    if [ -z "$2" ]; then
        echo -e "${BLUE}Viewing logs for all services...${NC}"
        $COMPOSE_CMD -f $COMPOSE_FILE logs --tail=100 -f
    else
        echo -e "${BLUE}Viewing logs for $2 service...${NC}"
        $COMPOSE_CMD -f $COMPOSE_FILE logs --tail=100 -f $2
    fi
}

# Function to build the application
build_app() {
    echo -e "${BLUE}Building StreamBridge application...${NC}"
    $COMPOSE_CMD -f $COMPOSE_FILE build

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}StreamBridge application built successfully.${NC}"
    else
        echo -e "${RED}Failed to build StreamBridge application.${NC}"
    fi
}

# Main script logic
case "$1" in
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        restart_app
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs $@
        ;;
    build)
        build_app
        ;;
    *)
        echo -e "${YELLOW}StreamBridge Application Management Script${NC}"
        echo -e "Usage: $0 [command]"
        echo -e "Commands:"
        echo -e "  start    - Start the application"
        echo -e "  stop     - Stop the application"
        echo -e "  restart  - Restart the application"
        echo -e "  status   - Check application status"
        echo -e "  logs     - View logs (use: $0 logs [service_name])"
        echo -e "  build    - Build the application"
        ;;
esac

exit 0