// server.js - Main application entry point
const http = require('http');
const https = require('https');
const fs = require('fs');
const app = require('./app');
const { initializeWebSocketServer } = require('./websocket/server');
const { logger } = require('./utils/logger');
const { connectKafka, disconnectKafka } = require('./config/kafka');
const { connectRabbitMQ, disconnectRabbitMQ } = require('./config/rabbitmq');
const { initializeMetrics } = require('./metrics/prometheus');

// Environment variables
const PORT = process.env.PORT || 3000;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Create HTTP or HTTPS server
let server;

if (USE_HTTPS) {
    // SSL/TLS configuration for HTTPS
    const httpsOptions = {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
        // Additional options for secure HTTPS
        minVersion: 'TLSv1.2',
        ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256'
    };

    server = https.createServer(httpsOptions, app);
    logger.info('HTTPS server created with TLS/SSL encryption');
} else {
    server = http.createServer(app);
    logger.info('HTTP server created');
}

// Prometheus metrics
initializeMetrics(app);

// Initialize WebSocket server
initializeWebSocketServer(server);

// Start the server
async function startServer() {
    try {
        // Connect to message brokers
        await connectKafka();
        await connectRabbitMQ();

        // Start listening for connections
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`API documentation available at /api-docs`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
function gracefulShutdown(signal) {
    logger.info(`${signal} received. Shutting down gracefully...`);

    // Close server first to stop accepting new connections
    server.close(async () => {
        try {
            // Disconnect from message brokers
            await disconnectKafka();
            await disconnectRabbitMQ();

            logger.info('All connections closed successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    });

    // Force shutdown after timeout if graceful shutdown fails
    setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
    }, 30000); // 30 seconds timeout
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    // Don't exit for unhandled rejections, just log them
});

// Start the server
startServer();

module.exports = server; // Export for testing