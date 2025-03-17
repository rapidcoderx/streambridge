// consumer.js - Kafka consumer implementation
const { createConsumer: createKafkaConsumer } = require('../../config/kafka');
const { logger, createTransactionLogger } = require('../../utils/logger');
const { broadcast } = require('../../websocket/server');
const { validateMessage } = require('../../api/validators/messageValidator');
const { recordMessageConsume, startMessageProcessingTimer } = require('../../metrics/prometheus');
const env = require('../../config/environment');

// Store active consumers
const activeConsumers = new Map();

/**
 * Create a Kafka consumer for a topic
 * @param {string} topic - Kafka topic to consume
 * @param {object} options - Consumer options
 * @returns {Promise<object>} - Kafka consumer instance
 */
const createConsumer = async (topic, options = {}) => {
    try {
        // Check if consumer already exists for this topic
        if (activeConsumers.has(topic)) {
            logger.debug(`Consumer already exists for topic ${topic}`);
            return activeConsumers.get(topic);
        }

        // Generate consumer group ID if not provided
        const groupId = options.groupId || `message-hub-${topic}-${Date.now()}`;

        // Create Kafka consumer
        const consumer = await createKafkaConsumer(groupId, topic, async (message) => {
            // Generate transaction ID for message
            const transactionId = `kafka-${topic}-${message.offset}-${Date.now()}`;
            const txLogger = createTransactionLogger(transactionId, { source: 'kafka', topic });
            txLogger.debug(`Processing message from topic ${topic}, partition ${message.partition}, offset ${message.offset}`);

            // Start timer for message processing
            const endTimer = startMessageProcessingTimer('kafka', topic, message.key || 'unknown', 'consume');

            try {
                // Parse message value if it's JSON
                let messageValue = message.value;
                try {
                    // Try to parse as JSON
                    if (typeof messageValue === 'string') {
                        messageValue = JSON.parse(messageValue);
                    }
                } catch (parseError) {
                    // Not JSON, use as is
                    txLogger.debug('Message is not JSON, using raw value');
                }

                // Extract message type from headers
                let messageType = 'unknown';
                if (message.headers && message.headers['x-message-type']) {
                    messageType = message.headers['x-message-type'].toString();
                }

                // Validate message schema if enabled
                if (env.VALIDATE_MESSAGES) {
                    const validationResult = await validateMessage(messageType, messageValue);

                    if (!validationResult.valid) {
                        txLogger.warn(`Message validation failed: ${validationResult.error}`);
                    }
                }

                // Broadcast message to WebSocket clients
                const wsMessage = {
                    type: 'message',
                    source: 'kafka',
                    topic,
                    partition: message.partition,
                    offset: message.offset,
                    key: message.key,
                    headers: message.headers,
                    timestamp: new Date().toISOString(),
                    transactionId,
                    message: messageValue
                };

                broadcast(wsMessage, [topic, 'kafka', 'all']);

                // Record metrics
                recordMessageConsume('kafka', topic, messageType);

                // End processing timer
                endTimer();

                txLogger.info(`Successfully processed message from topic ${topic}`);
                return true;
            } catch (error) {
                txLogger.error(`Error processing message: ${error.message}`, { error });

                // End processing timer with error
                endTimer(true);

                // Re-throw to let Kafka handler deal with it
                throw error;
            }
        });

        // Store in active consumers map
        activeConsumers.set(topic, consumer);

        logger.info(`Kafka consumer created for topic ${topic} with group ID ${groupId}`);
        return consumer;
    } catch (error) {
        logger.error(`Error creating Kafka consumer for topic ${topic}:`, error);
        throw error;
    }
};

/**
 * Close a Kafka consumer
 * @param {string} topic - Kafka topic
 * @returns {Promise<boolean>} - Success indicator
 */
const closeConsumer = async (topic) => {
    try {
        const consumer = activeConsumers.get(topic);

        if (!consumer) {
            logger.warn(`No active consumer found for topic ${topic}`);
            return false;
        }

        // Disconnect consumer
        await consumer.disconnect();

        // Remove from active consumers
        activeConsumers.delete(topic);

        logger.info(`Kafka consumer closed for topic ${topic}`);
        return true;
    } catch (error) {
        logger.error(`Error closing Kafka consumer for topic ${topic}:`, error);
        throw error;
    }
};

/**
 * Close all Kafka consumers
 * @returns {Promise<void>}
 */
const closeAllConsumers = async () => {
    try {
        const closePromises = [];

        // Close each consumer
        activeConsumers.forEach((consumer, topic) => {
            closePromises.push(closeConsumer(topic));
        });

        // Wait for all to close
        await Promise.all(closePromises);

        logger.info('All Kafka consumers closed');
    } catch (error) {
        logger.error('Error closing Kafka consumers:', error);
        throw error;
    }
};

module.exports = {
    createConsumer,
    closeConsumer,
    closeAllConsumers,
    getActiveConsumers: () => activeConsumers
};