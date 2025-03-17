// server.js - WebSocket server for real-time message broadcasting
const WebSocket = require('ws');
const url = require('url');
const { logger } = require('../utils/logger');
const { verifyToken } = require('../auth/jwt');
const { verifyApiKey } = require('../auth/apiKey');

// WebSocket server instance
let wss = null;

// Client connections store
const clients = new Map();

// Initialize WebSocket server
const initializeWebSocketServer = (server) => {
    // Create WebSocket server
    wss = new WebSocket.Server({
        server,
        path: process.env.WEBSOCKET_PATH || '/ws',
        clientTracking: true,
    });

    logger.info(`WebSocket server initialized on path: ${wss.options.path}`);

    // Handle new connections
    wss.on('connection', async (ws, req) => {
        try {
            // Parse query parameters
            const parsedUrl = url.parse(req.url, true);
            const { token, apiKey, topics = '', clientId = generateClientId() } = parsedUrl.query;

            // Authenticate client
            const authResult = await authenticateClient(token, apiKey, req);

            if (!authResult.authenticated) {
                ws.close(4001, 'Authentication failed');
                return;
            }

            // Set up client data
            const clientTopics = topics.split(',').filter(Boolean);
            const clientIp = getClientIp(req);

            const clientData = {
                id: clientId,
                ws,
                topics: clientTopics,
                userId: authResult.userId || 'anonymous',
                connectedAt: new Date(),
                ip: clientIp,
                isAlive: true,
            };

            // Store client connection
            clients.set(clientId, clientData);

            logger.info(`WebSocket client connected: ${clientId} from ${clientIp} subscribed to topics: ${clientTopics.join(', ')}`);

            // Send welcome message
            sendToClient(ws, {
                type: 'connection',
                clientId,
                topics: clientTopics,
                timestamp: new Date().toISOString(),
                message: 'Connected to WebSocket server',
            });

            // Handle pings to keep connection alive
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            // Handle incoming messages
            ws.on('message', (message) => handleClientMessage(message, clientData));

            // Handle disconnection
            ws.on('close', () => {
                logger.info(`WebSocket client disconnected: ${clientId}`);
                clients.delete(clientId);
            });

            // Handle errors
            ws.on('error', (error) => {
                logger.error(`WebSocket error for client ${clientId}:`, error);
            });
        } catch (error) {
            logger.error('Error handling WebSocket connection:', error);
            ws.close(4000, 'Internal server error');
        }
    });

    // Set up heartbeat interval to detect dead connections
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }

            ws.isAlive = false;
            ws.ping();
        });
    }, 30000); // 30 seconds

    // Handle server errors
    wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
    });

    // Clean up on server close
    wss.on('close', () => {
        clearInterval(heartbeatInterval);
        logger.info('WebSocket server closed');
    });

    return wss;
};

// Authenticate WebSocket client
const authenticateClient = async (token, apiKey, req) => {
    try {
        // Skip authentication if disabled
        if (process.env.WEBSOCKET_AUTH_REQUIRED !== 'true') {
            return { authenticated: true };
        }

        // Try JWT authentication first
        if (token) {
            const jwtResult = await verifyToken(token);
            if (jwtResult.valid) {
                return {
                    authenticated: true,
                    userId: jwtResult.userId,
                    authMethod: 'jwt',
                };
            }
        }

        // Try API key authentication
        if (apiKey) {
            const apiKeyResult = await verifyApiKey(apiKey);
            if (apiKeyResult.valid) {
                return {
                    authenticated: true,
                    userId: apiKeyResult.userId,
                    authMethod: 'apiKey',
                };
            }
        }

        // Check allowed origins if configured
        const origin = req.headers.origin;
        if (process.env.ALLOWED_WEBSOCKET_ORIGINS) {
            const allowedOrigins = process.env.ALLOWED_WEBSOCKET_ORIGINS.split(',');
            if (origin && allowedOrigins.includes(origin)) {
                return {
                    authenticated: true,
                    authMethod: 'origin',
                };
            }
        }

        logger.warn(`WebSocket authentication failed from ${getClientIp(req)}`);
        return { authenticated: false };
    } catch (error) {
        logger.error('Error authenticating WebSocket client:', error);
        return { authenticated: false };
    }
};

// Handle messages from clients
const handleClientMessage = async (data, clientData) => {
    try {
        const message = JSON.parse(data);

        // Validate message structure
        if (!message.type) {
            sendToClient(clientData.ws, {
                type: 'error',
                error: 'Invalid message format',
                originalMessage: message,
            });
            return;
        }

        // Handle different message types
        switch (message.type) {
            case 'ping':
                // Respond to ping with pong
                sendToClient(clientData.ws, {
                    type: 'pong',
                    timestamp: new Date().toISOString(),
                    echo: message.echo,
                });
                break;

            case 'subscribe':
                // Handle topic subscription
                if (message.topics && Array.isArray(message.topics)) {
                    const newTopics = message.topics.filter(Boolean);
                    clientData.topics = [...new Set([...clientData.topics, ...newTopics])];

                    sendToClient(clientData.ws, {
                        type: 'subscribed',
                        topics: clientData.topics,
                        timestamp: new Date().toISOString(),
                    });

                    logger.debug(`Client ${clientData.id} subscribed to topics: ${newTopics.join(', ')}`);
                }
                break;

            case 'unsubscribe':
                // Handle topic unsubscription
                if (message.topics && Array.isArray(message.topics)) {
                    const removedTopics = message.topics.filter(Boolean);
                    clientData.topics = clientData.topics.filter(topic => !removedTopics.includes(topic));

                    sendToClient(clientData.ws, {
                        type: 'unsubscribed',
                        topics: clientData.topics,
                        removedTopics,
                        timestamp: new Date().toISOString(),
                    });

                    logger.debug(`Client ${clientData.id} unsubscribed from topics: ${removedTopics.join(', ')}`);
                }
                break;

            default:
                // Handle unknown message types
                sendToClient(clientData.ws, {
                    type: 'error',
                    error: `Unknown message type: ${message.type}`,
                    originalMessage: message,
                    timestamp: new Date().toISOString(),
                });
        }
    } catch (error) {
        logger.error(`Error handling client message from ${clientData.id}:`, error);
        sendToClient(clientData.ws, {
            type: 'error',
            error: 'Failed to process message',
            timestamp: new Date().toISOString(),
        });
    }
};

// Send message to specific client
const sendToClient = (ws, message) => {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            logger.error('Error sending message to WebSocket client:', error);
        }
    }
};

// Broadcast message to all clients or specific topics
const broadcast = (message, topics = []) => {
    if (!wss) {
        logger.warn('WebSocket server not initialized, cannot broadcast message');
        return;
    }

    const hasTopicFilter = Array.isArray(topics) && topics.length > 0;
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    let sentCount = 0;

    clients.forEach((client) => {
        try {
            // Skip clients that are not connected
            if (client.ws.readyState !== WebSocket.OPEN) {
                return;
            }

            // Filter by topics if specified
            if (hasTopicFilter) {
                const hasMatchingTopic = topics.some(topic =>
                    client.topics.includes(topic) || client.topics.includes('*')
                );

                if (!hasMatchingTopic) {
                    return;
                }
            }

            // Send the message
            client.ws.send(messageString);
            sentCount++;
        } catch (error) {
            logger.error(`Error broadcasting to client ${client.id}:`, error);
        }
    });

    logger.debug(`Broadcast message to ${sentCount} clients`);
    return sentCount;
};

// Get client IP address
const getClientIp = (req) => {
    return (
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket.remoteAddress
    );
};

// Generate unique client ID
const generateClientId = () => {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
};

// Get WebSocket server stats
const getStats = () => {
    if (!wss) {
        return {
            initialized: false,
            clients: 0,
        };
    }

    // Count clients by topics
    const topicCounts = {};
    clients.forEach((client) => {
        client.topics.forEach((topic) => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
    });

    return {
        initialized: true,
        clients: clients.size,
        topics: topicCounts,
    };
};

module.exports = {
    initializeWebSocketServer,
    broadcast,
    getStats,
    getClients: () => clients,
};