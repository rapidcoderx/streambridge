// healthRoutes.js - Health check routes for monitoring
const express = require('express');
const router = express.Router();
const os = require('os');
const { getKafkaClient } = require('../../config/kafka');
const { getConnection: getRabbitMQConnection } = require('../../config/rabbitmq');
const { getStats: getWebSocketStats } = require('../../websocket/server');
const { logger } = require('../../utils/logger');

// Basic health check endpoint
router.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: process.env.SERVICE_NAME || 'streambridge'
    });
});

// Detailed health check with component status
router.get('/detailed', async (req, res) => {
    try {
        // Check Kafka connection
        const kafkaClient = getKafkaClient();
        const kafkaStatus = kafkaClient ? 'connected' : 'disconnected';

        // Check RabbitMQ connection
        const rabbitMQConnection = getRabbitMQConnection();
        const rabbitMQStatus = rabbitMQConnection ? 'connected' : 'disconnected';

        // Check WebSocket server
        const wsStats = getWebSocketStats();
        const wsStatus = wsStats.initialized ? 'running' : 'stopped';

        // System metrics
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const cpuLoad = os.loadavg();

        // Health status
        const componentsStatus = {
            kafka: kafkaStatus,
            rabbitmq: rabbitMQStatus,
            websocket: wsStatus
        };

        // Overall system status
        const systemStatus = Object.values(componentsStatus).every(status => status === 'connected' || status === 'running')
            ? 'healthy'
            : 'degraded';

        res.status(200).json({
            status: systemStatus,
            timestamp: new Date().toISOString(),
            service: process.env.SERVICE_NAME || 'streambridge',
            version: process.env.VERSION || '1.0.0',
            components: componentsStatus,
            websocket: {
                clients: wsStats.clients,
                topics: wsStats.topics
            },
            system: {
                uptime: {
                    seconds: uptime,
                    formatted: formatUptime(uptime)
                },
                memory: {
                    total: formatBytes(totalMemory),
                    free: formatBytes(freeMemory),
                    usage: formatBytes(memoryUsage.rss),
                    heapTotal: formatBytes(memoryUsage.heapTotal),
                    heapUsed: formatBytes(memoryUsage.heapUsed),
                    external: formatBytes(memoryUsage.external)
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system,
                    loadAvg: cpuLoad
                },
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version
            }
        });
    } catch (error) {
        logger.error('Error generating health check:', error);

        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: 'Failed to generate health check',
            error: error.message
        });
    }
});

// Check Kafka connection status
router.get('/kafka', (req, res) => {
    const kafkaClient = getKafkaClient();
    const status = kafkaClient ? 'connected' : 'disconnected';

    res.status(status === 'connected' ? 200 : 503).json({
        component: 'kafka',
        status,
        timestamp: new Date().toISOString()
    });
});

// Check RabbitMQ connection status
router.get('/rabbitmq', (req, res) => {
    const rabbitMQConnection = getRabbitMQConnection();
    const status = rabbitMQConnection ? 'connected' : 'disconnected';

    res.status(status === 'connected' ? 200 : 503).json({
        component: 'rabbitmq',
        status,
        timestamp: new Date().toISOString()
    });
});

// Check WebSocket server status
router.get('/websocket', (req, res) => {
    const wsStats = getWebSocketStats();
    const status = wsStats.initialized ? 'running' : 'stopped';

    res.status(status === 'running' ? 200 : 503).json({
        component: 'websocket',
        status,
        clients: wsStats.clients,
        topics: wsStats.topics,
        timestamp: new Date().toISOString()
    });
});

// Format uptime in human-readable format
const formatUptime = (seconds) => {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
};

// Format bytes in human-readable format
const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = router;