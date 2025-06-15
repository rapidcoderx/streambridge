# StreamBridge - Kafka and RabbitMQ Client

A comprehensive full-stack application for publishing and consuming messages from Kafka and RabbitMQ with a responsive web UI.

## Features

### Backend
- **Support for Multiple Messaging Systems**: Connect to both Kafka and RabbitMQ with a unified API
- **Real-time Communication**: WebSocket server for broadcasting messages to clients
- **Authentication**: Secure access with both JWT tokens and API keys
- **Metrics & Monitoring**: Prometheus metrics and structured logging with Winston
- **API Documentation**: Swagger UI for API reference
- **Resilience**: Graceful shutdowns, reconnection logic, error queues for failed message processing
- **Security**: TLS/SSL support, input validation, rate limiting

### Frontend
- **Responsive Design**: Mobile-friendly UI that works on all devices
- **Real-time Updates**: Live message reception via WebSockets
- **Advanced Features**: Search with highlighting, pause/resume, live and history modes
- **Message Management**: Format and validate messages, use templates for common formats
- **Theming**: Light and dark mode support
- **Accessibility**: WCAG 2.1 AA compliant

## Architecture

The application consists of several components:

- **Backend Service**: Node.js application handling API requests and WebSocket connections
- **Frontend Application**: HTML/CSS/JavaScript responsive web interface
- **Kafka**: Message broker for high-throughput messaging
- **RabbitMQ**: Message broker with advanced routing capabilities
- **Prometheus**: Metrics collection and monitoring
- **Grafana**: Visualization of metrics and system performance

## Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for development)
- Kafka and RabbitMQ instances (or use the included Docker Compose setup)

## Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/example/streambridge.git
   cd streambridge
   ```

2. Start the application with Docker Compose:
   ```bash
   # Unix/Linux/macOS
   ./run.sh start
   
   # Windows
   run.bat start
   ```

3. Access the application:
   - Frontend UI: http://localhost:8080
   - Backend API: http://localhost:5045
   - API Documentation: http://localhost:5045/api-docs
   - Kafka UI: http://localhost:8090
   - RabbitMQ Management UI: http://localhost:15672 (Username: streambridge, Password: streambridge-password)
   - Prometheus: http://localhost:9090
   - Grafana: http://localhost:3001 (Username: admin, Password: admin)

## Configuration

The application can be configured using environment variables in the `.env` file. The run script will create a default `.env` file if one doesn't exist.

### Important Configuration Options

#### Backend
- `PORT`: The port for the backend API server (default: 5045)
- `JWT_SECRET`: Secret key for JWT token generation and validation
- `ENCRYPTION_KEY`: Key for message encryption/decryption
- `KAFKA_BROKERS`: Comma-separated list of Kafka brokers
- `RABBITMQ_HOST`, `RABBITMQ_PORT`: RabbitMQ connection details
- `LOG_LEVEL`: Logging level (default: info)

#### Frontend
- `API_URL`: URL of the backend API (default: http://localhost:5045)
- `WEBSOCKET_URL`: URL of the WebSocket server (default: ws://localhost:5045/ws)

## API Documentation

The API is documented using Swagger UI and is available at http://localhost:5045/api-docs when the application is running.

### Key Endpoints

- **GET /api/messages/destinations**: Get available Kafka topics and RabbitMQ queues/exchanges
- **POST /api/messages**: Publish a message
- **GET /api/messages/history**: Get message history
- **GET /health**: Health check endpoint
- **POST /api/auth/login**: User authentication
- **POST /api/auth/apikey**: Generate API key

## WebSocket API

The WebSocket server is available at ws://localhost:5045/ws and supports the following features:

- Subscribe to specific destinations
- Receive real-time messages
- Authentication via query parameters (token or apiKey)

### Example Connection

```javascript
const ws = new WebSocket('ws://localhost:5045/ws?destination=kafka://my-topic&token=jwt-token');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received message:', message);
};
```

## Development

### Backend Development

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

### Frontend Development

The frontend is served as static files. For development:

1. Modify the files in `frontend/public/`
2. Refresh the browser to see changes

## Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration
```

## Deployment

### Docker Deployment

The application is containerized and can be deployed using Docker Compose:

```bash
docker-compose up -d
```

### Kubernetes Deployment

Sample Kubernetes manifests are available in the `k8s/` directory.

## Scaling

The application is designed to scale horizontally:

- Backend service can be scaled to multiple instances behind a load balancer
- Kafka and RabbitMQ can be configured as clusters
- WebSocket connections can be load-balanced with sticky sessions

## Monitoring and Metrics

The application exports Prometheus metrics at `/metrics` endpoint, including:

- Message throughput (messages/second)
- API request latency
- Connection status
- Memory usage
- Error rates

## License

MIT License - See LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.