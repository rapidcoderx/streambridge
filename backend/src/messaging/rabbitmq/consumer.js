// consumer.js - RabbitMQ consumer implementation
const { createConsumer: createRabbitMQConsumer } = require('../../config/rabbitmq');
const { logger, createTransactionLogger } = require('../../utils/logger');
const { broadcast } = require('../../websocket/server');
const { validateMessage } = require('../../api/validators/messageValidator');
const { recordMessageConsume, startMessageProcessingTimer } = require('../../metrics/prometheus');
const env = require('../../config/environment');

// Store active consumers
const activeConsumers = new Map();

/**
 * Create a RabbitMQ consumer for a queue
 * @param {string} queue - RabbitMQ queue to consume
 * @param {object} options - Consumer options
 * @returns {Promise<object>} - RabbitMQ consumer instance
 */
const createConsumer = async (queue, options = {}) => {
    try {
        // Check if consumer already exists for this queue
        if (activeConsumers.has(queue)) {
            logger.debug(`Consumer already exists for queue ${queue}`);
            return activeConsumers.get(queue);
        }

        // Create RabbitMQ consumer
        const consumer = await createRabbitMQConsumer(queue, async (message) => {
            // Generate transaction ID for message
            const transactionId = `rabbitmq-${queue}-${Date.now()}`;
            const txLogger = createTransactionLogger(transactionId, { source: 'rabbitmq', queue });
            txLogger.debug(`Processing message from queue ${queue}`);

            // Start timer for message processing
            const endTimer = startMessageProcessingTimer('rabbitmq', queue,
                message.properties?.type || 'unknown', 'consume');

            try {
                // Extract message content
                let content = message.content;

                // Try to parse content if it's JSON
                if (typeof content === 'string' || content instanceof Buffer) {
                    try {
                        if (content instanceof Buffer) {
                            content = content.toString();
                        }
                        content = JSON.parse(content);
                    } catch (parseError) {
                        // Not JSON, use as is
                        txLogger.debug('Message is not JSON, using raw value');
                    }
                }

                // Extract message type from properties
                let messageType = 'unknown';
                if (message.properties && message.properties.type) {
                    messageType = message.properties.type;
                } else if (message.properties && message.properties.headers && message.properties.headers['x-message-type']) {
                    messageType = message.properties.headers['x-message-type'].toString();
                }

                // Validate message schema if enabled
                if (env.VALIDATE_MESSAGES) {
                    const validationResult = await validateMessage(messageType, content);

                    if (!validationResult.valid) {
                        txLogger.warn(`Message validation failed: ${validationResult.error}`);
                    }
                }

                // Extract headers from properties
                const headers = {
                    ...(message.properties.headers || {})
                };

                // Add additional properties as headers
                for (const [key, value] of Object.entries(message.properties)) {
                    if (key !== 'headers' && typeof value !== 'function' && value !== undefined) {
                        headers[key] = value;
                    }
                }

                // Broadcast message to WebSocket clients
                const wsMessage = {
                    type: 'message',
                    source: 'rabbitmq',
                    queue,
                    routingKey: message.fields.routingKey,
                    headers,
                    timestamp: new Date().toISOString(),
                    transactionId,
                    message: content
                };

                broadcast(wsMessage, [queue, 'rabbitmq', 'all']);

                // Record metrics
                recordMessageConsume('rabbitmq', queue, messageType);

                // End processing timer
                endTimer();

                txLogger.info(`Successfully processed message from queue ${queue}`);
                return true;
            } catch (error) {
                txLogger.error(`Error processing message: ${error.message}`, { error });

                // End processing timer with error
                endTimer(true);

                // Re-throw to let RabbitMQ handler deal with it
                throw error;
            }
        }, {
            prefetchCount: options.prefetchCount,
            prefetchGlobal: options.prefetchGlobal,
            queueOptions: options.queueOptions,
            requeue: options.requeue,
            consumeOptions: options.consumeOptions
        });

        // Store in active consumers map
        activeConsumers.set(queue, consumer);

        logger.info(`RabbitMQ consumer created for queue ${queue}`);
        return consumer;
    } catch (error) {
        logger.error(`Error creating RabbitMQ consumer for queue ${queue}:`, error);
        throw error;
    }
};

/**
 * Create a RabbitMQ consumer for an exchange with a routing key
 * @param {string} exchange - RabbitMQ exchange
 * @param {string} routingKey - Routing key
 * @param {object} options - Consumer options
 * @returns {Promise<object>} - RabbitMQ consumer instance
 */
const createExchangeConsumer = async (exchange, routingKey, options = {}) => {
    try {
        // Generate a unique queue name for this consumer
        const queueName = options.queueName || `${exchange}.${routingKey}.${Date.now()}`;

        // Create RabbitMQ channel
        const { getProducerChannel, assertQueue, assertExchange, bindQueue } = require('../../config/rabbitmq');
        const channel = getProducerChannel();

        if (!channel) {
            throw new Error('RabbitMQ channel not available');
        }

        // Assert exchange
        await assertExchange(
            channel,
            exchange,
            options.exchangeType || 'topic',
            options.exchangeOptions
        );

        // Assert queue
        await assertQueue(channel, queueName, {
            durable: true,
            autoDelete: options.autoDelete || false,
            exclusive: options.exclusive || false,
            ...options.queueOptions
        });

        // Bind queue to exchange
        await bindQueue(channel, queueName, exchange, routingKey);

        // Create consumer for the queue
        return await createConsumer(queueName, options);
    } catch (error) {
        logger.error(`Error creating RabbitMQ exchange consumer for ${exchange} with routing key ${routingKey}:`, error);
        throw error;
    }
};

/**
 * Close a RabbitMQ consumer
 * @param {string} queue - RabbitMQ queue
 * @returns {Promise<boolean>} - Success indicator
 */
const closeConsumer = async (queue) => {
    try {
        const consumer = activeConsumers.get(queue);

        if (!consumer) {
            logger.warn(`No active consumer found for queue ${queue}`);
            return false;
        }

        // Close channel
        await consumer.close();

        // Remove from active consumers
        activeConsumers.delete(queue);

        logger.info(`RabbitMQ consumer closed for queue ${queue}`);
        return true;
    } catch (error) {
        logger.error(`Error closing RabbitMQ consumer for queue ${queue}:`, error);
        throw error;
    }
};

/**
 * Close all RabbitMQ consumers
 * @returns {Promise<void>}
 */
const closeAllConsumers = async () => {
    try {
        const closePromises = [];

        // Close each consumer
        activeConsumers.forEach((consumer, queue) => {
            closePromises.push(closeConsumer(queue));
        });

        // Wait for all to close
        await Promise.all(closePromises);

        logger.info('All RabbitMQ consumers closed');
    } catch (error) {
        logger.error('Error closing RabbitMQ consumers:', error);
        throw error;
    }
};

module.exports = {
    createConsumer,
    createExchangeConsumer,
    closeConsumer,
    closeAllConsumers,
    getActiveConsumers: () => activeConsumers
};