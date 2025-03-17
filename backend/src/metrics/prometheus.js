// prometheus.js - Prometheus metrics configuration
const promClient = require('prom-client');
const { logger } = require('../utils/logger');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
    register,
    prefix: 'message_hub_',
    labels: {
        app: 'message_hub',
        environment: process.env.NODE_ENV || 'development'
    },
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// Custom metrics

// Message publish counter
const messagePublishCounter = new promClient.Counter({
    name: 'message_hub_messages_published_total',
    help: 'Total number of messages published',
    labelNames: ['protocol', 'destination', 'message_type', 'status']
});

// Message consume counter
const messageConsumeCounter = new promClient.Counter({
    name: 'message_hub_messages_consumed_total',
    help: 'Total number of messages consumed',
    labelNames: ['protocol', 'destination', 'message_type', 'status']
});

// Message processing time
const messageProcessingTime = new promClient.Histogram({
    name: 'message_hub_message_processing_duration_seconds',
    help: 'Message processing time in seconds',
    labelNames: ['protocol', 'destination', 'message_type', 'operation'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10]
});

// Connection status gauge
const connectionStatus = new promClient.Gauge({
    name: 'message_hub_connection_status',
    help: 'Connection status (1 = connected, 0 = disconnected)',
    labelNames: ['component']
});

// Queue/Topic message count
const queueMessageCount = new promClient.Gauge({
    name: 'message_hub_queue_message_count',
    help: 'Number of messages in queue/topic',
    labelNames: ['protocol', 'destination']
});

// API request counter
const httpRequestsTotal = new promClient.Counter({
    name: 'message_hub_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

// HTTP request duration
const httpRequestDuration = new promClient.Histogram({
    name: 'message_hub_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

// WebSocket connections gauge
const websocketConnections = new promClient.Gauge({
    name: 'message_hub_websocket_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['topic']
});

// Error counter
const errorCounter = new promClient.Counter({
    name: 'message_hub_errors_total',
    help: 'Total number of errors',
    labelNames: ['component', 'error_type']
});

// Register all custom metrics
register.registerMetric(messagePublishCounter);
register.registerMetric(messageConsumeCounter);
register.registerMetric(messageProcessingTime);
register.registerMetric(connectionStatus);
register.registerMetric(queueMessageCount);
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpRequestDuration);
register.registerMetric(websocketConnections);
register.registerMetric(errorCounter);

// Set initial values
connectionStatus.set({ component: 'kafka' }, 0);
connectionStatus.set({ component: 'rabbitmq' }, 0);
connectionStatus.set({ component: 'websocket' }, 0);

// Middleware to expose metrics endpoint
const initializeMetrics = (app) => {
    // Create Prometheus metrics endpoint
    app.get('/metrics', async (req, res) => {
        try {
            res.set('Content-Type', register.contentType);
            res.end(await register.metrics());
        } catch (error) {
            logger.error('Error generating metrics:', error);
            res.status(500).send('Error generating metrics');
        }
    });

    // Middleware to record HTTP metrics
    app.use((req, res, next) => {
        // Skip metrics endpoint itself
        if (req.path === '/metrics') {
            return next();
        }

        // Record request start time
        const start = process.hrtime();

        // Record response
        const recordMetrics = () => {
            // Get route path (normalize dynamic routes)
            const route = req.route ? req.baseUrl + req.route.path : req.path;

            // Calculate duration
            const [seconds, nanoseconds] = process.hrtime(start);
            const duration = seconds + nanoseconds / 1e9;

            // Record metrics
            httpRequestsTotal.inc({
                method: req.method,
                route,
                status_code: res.statusCode
            });

            httpRequestDuration.observe({
                method: req.method,
                route,
                status_code: res.statusCode
            }, duration);

            // Record errors
            if (res.statusCode >= 400) {
                errorCounter.inc({
                    component: 'http',
                    error_type: res.statusCode >= 500 ? 'server_error' : 'client_error'
                });
            }
        };

        // Add listeners for response events
        res.on('finish', recordMetrics);
        res.on('close', recordMetrics);

        next();
    });

    logger.info('Prometheus metrics initialized at /metrics');
};

// Update connection status
const updateConnectionStatus = (component, isConnected) => {
    connectionStatus.set({ component }, isConnected ? 1 : 0);
};

// Record message publishing
const recordMessagePublish = (protocol, destination, messageType, status = 'success') => {
    messagePublishCounter.inc({
        protocol,
        destination,
        message_type: messageType,
        status
    });
};

// Record message consumption
const recordMessageConsume = (protocol, destination, messageType, status = 'success') => {
    messageConsumeCounter.inc({
        protocol,
        destination,
        message_type: messageType,
        status
    });
};

// Start message processing timer
const startMessageProcessingTimer = (protocol, destination, messageType, operation) => {
    return messageProcessingTime.startTimer({
        protocol,
        destination,
        message_type: messageType,
        operation
    });
};

// Update queue/topic message count
const updateQueueMessageCount = (protocol, destination, count) => {
    queueMessageCount.set({ protocol, destination }, count);
};

// Update WebSocket connections
const updateWebSocketConnections = (topic, count) => {
    websocketConnections.set({ topic }, count);
};

// Record error
const recordError = (component, errorType) => {
    errorCounter.inc({ component, error_type: errorType });
};

module.exports = {
    register,
    initializeMetrics,
    updateConnectionStatus,
    recordMessagePublish,
    recordMessageConsume,
    startMessageProcessingTimer,
    updateQueueMessageCount,
    updateWebSocketConnections,
    recordError
};