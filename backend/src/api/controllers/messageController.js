// messageController.js - Message API controller
const { publishMessage: publishToKafka } = require('../../config/kafka');
const { publishMessage: publishToRabbitMQ, publishToQueue } = require('../../config/rabbitmq');
const { logger, createTransactionLogger } = require('../../utils/logger');
const { broadcast } = require('../../websocket/server');
const { validateMessage } = require('../validators/messageValidator');

// Controller for handling message operations
const messageController = {
    // Publish a message
    publishMessage: async (req, res) => {
        try {
            const {
                destination,
                message,
                messageType = 'default',
                routingKey = '',
                headers = {},
                options = {}
            } = req.body;

            // Validate required fields
            if (!destination) {
                return res.status(400).json({ message: 'Destination is required' });
            }

            if (!message) {
                return res.status(400).json({ message: 'Message content is required' });
            }

            // Generate transaction ID for tracking
            const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
            const txLogger = createTransactionLogger(transactionId, {
                destination,
                messageType,
                userId: req.user?.id || 'anonymous'
            });

            // Validate message schema if enabled
            if (process.env.VALIDATE_MESSAGES === 'true') {
                const validationResult = await validateMessage(messageType, message);

                if (!validationResult.valid) {
                    txLogger.warn(`Message validation failed: ${validationResult.error}`);
                    return res.status(400).json({
                        message: 'Message validation failed',
                        errors: validationResult.errors
                    });
                }
            }

            // Determine if Kafka or RabbitMQ based on destination format
            const destParts = destination.split('://');
            const protocol = destParts.length > 1 ? destParts[0].toLowerCase() : 'kafka';
            const dest = destParts.length > 1 ? destParts[1] : destination;

            // Add transaction ID and timestamp to headers
            const messageHeaders = {
                ...headers,
                'x-transaction-id': transactionId,
                'x-published-at': new Date().toISOString(),
                'x-published-by': req.user?.id || 'anonymous',
                'x-message-type': messageType
            };

            // Process the message based on the protocol
            let result;

            if (protocol === 'rabbitmq') {
                txLogger.info(`Publishing message to RabbitMQ: ${dest}`);

                // Check if direct queue or exchange
                if (options.directQueue) {
                    result = await publishToQueue(dest, message, {
                        messageOptions: messageHeaders,
                        ...options
                    });
                } else {
                    // Use exchange with routing key
                    const exchange = dest;
                    result = await publishToRabbitMQ(exchange, routingKey, message, {
                        messageOptions: messageHeaders,
                        ...options
                    });
                }
            } else {
                // Default to Kafka
                txLogger.info(`Publishing message to Kafka topic: ${dest}`);

                result = await publishToKafka(dest, message,
                    options.key || null,
                    messageHeaders
                );
            }

            // Broadcast to WebSocket clients if enabled
            if (options.broadcast !== false) {
                const broadcastTopics = options.broadcastTopics || [dest];

                broadcast({
                    type: 'message',
                    source: protocol,
                    destination: dest,
                    messageType,
                    transactionId,
                    timestamp: new Date().toISOString(),
                    headers: messageHeaders,
                    message
                }, broadcastTopics);

                txLogger.debug(`Message broadcast to WebSocket clients on topics: ${broadcastTopics.join(', ')}`);
            }

            // Return success response
            txLogger.info('Message published successfully');

            return res.status(200).json({
                success: true,
                transactionId,
                destination,
                protocol,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error publishing message:', error);
            return res.status(500).json({ message: 'Failed to publish message', error: error.message });
        }
    },

    // Get message history
    getMessageHistory: async (req, res) => {
        try {
            const { destination, limit = 100, offset = 0 } = req.query;

            // In a real application, this would query a database or message store
            // For this example, we'll return a mock response

            logger.info(`Getting message history for ${destination}`);

            // Mock message history
            const mockHistory = [];

            for (let i = 0; i < Math.min(limit, 20); i++) {
                mockHistory.push({
                    id: `msg-${Date.now() - i * 60000}-${Math.random().toString(36).substring(2, 10)}`,
                    destination,
                    timestamp: new Date(Date.now() - i * 60000).toISOString(),
                    message: { data: `Sample message ${i}`, timestamp: new Date(Date.now() - i * 60000).toISOString() },
                    headers: {
                        'x-transaction-id': `tx-${Date.now() - i * 60000}-${Math.random().toString(36).substring(2, 6)}`,
                        'x-message-type': 'sample'
                    }
                });
            }

            return res.status(200).json({
                messages: mockHistory,
                pagination: {
                    totalCount: 150, // Mock total count
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    hasMore: parseInt(offset) + mockHistory.length < 150
                }
            });
        } catch (error) {
            logger.error('Error getting message history:', error);
            return res.status(500).json({ message: 'Failed to get message history', error: error.message });
        }
    },

    // Get available destinations (topics/queues)
    getDestinations: async (req, res) => {
        try {
            // In a real application, this would query Kafka and RabbitMQ for available topics/queues
            // For this example, we'll return mock destinations

            logger.info('Getting available destinations');

            const mockDestinations = {
                kafka: [
                    { name: 'messages', messageCount: 1250, partitions: 3 },
                    { name: 'notifications', messageCount: 428, partitions: 2 },
                    { name: 'events', messageCount: 3892, partitions: 5 },
                    { name: 'logs', messageCount: 15783, partitions: 4 },
                ],
                rabbitmq: {
                    queues: [
                        { name: 'tasks', messageCount: 42, consumers: 2 },
                        { name: 'notifications', messageCount: 0, consumers: 1 },
                        { name: 'emails', messageCount: 13, consumers: 0 },
                    ],
                    exchanges: [
                        { name: 'events', type: 'topic', queues: ['tasks', 'notifications'] },
                        { name: 'direct-exchange', type: 'direct', queues: ['emails'] },
                    ]
                }
            };

            return res.status(200).json(mockDestinations);
        } catch (error) {
            logger.error('Error getting destinations:', error);
            return res.status(500).json({ message: 'Failed to get destinations', error: error.message });
        }
    },

    // Get message schemas
    getMessageSchemas: async (req, res) => {
        try {
            // In a real application, this would return available message schemas
            // For this example, we'll return mock schemas

            logger.info('Getting message schemas');

            const mockSchemas = {
                'order': {
                    type: 'object',
                    required: ['orderId', 'items', 'customer'],
                    properties: {
                        orderId: { type: 'string' },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    productId: { type: 'string' },
                                    quantity: { type: 'number' },
                                    price: { type: 'number' }
                                }
                            }
                        },
                        customer: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' }
                            }
                        }
                    }
                },
                'notification': {
                    type: 'object',
                    required: ['type', 'message'],
                    properties: {
                        type: { type: 'string', enum: ['info', 'warning', 'error'] },
                        message: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' }
                    }
                }
            };

            return res.status(200).json(mockSchemas);
        } catch (error) {
            logger.error('Error getting message schemas:', error);
            return res.status(500).json({ message: 'Failed to get message schemas', error: error.message });
        }
    },

    // Delete messages (for admin/testing purposes)
    deleteMessages: async (req, res) => {
        try {
            const { destination } = req.params;

            // In a real application, this would delete messages from a persistence store
            // or reset a queue/topic

            logger.warn(`Deleting messages from ${destination} by ${req.user?.id || 'anonymous'}`);

            // Log this administrative action
            const { logAuditEvent } = require('../../utils/logger');
            logAuditEvent('ADMIN',
                { userId: req.user?.id || 'anonymous' },
                { resourceType: 'messages', destination },
                `Deleted messages from ${destination}`,
                true
            );

            return res.status(200).json({
                success: true,
                message: `Messages deleted from ${destination}`
            });
        } catch (error) {
            logger.error('Error deleting messages:', error);
            return res.status(500).json({ message: 'Failed to delete messages', error: error.message });
        }
    }
};

module.exports = messageController;