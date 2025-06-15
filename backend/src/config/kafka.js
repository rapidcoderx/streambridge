// kafka.js - Kafka configuration and connection management
const { Kafka } = require('kafkajs');
const { logger } = require('../utils/logger');
const { encryptData, decryptData } = require('../utils/encryption');

// Kafka connection configuration
const createKafkaClient = () => {
    try {
        const brokers = process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'];
        const clientId = process.env.KAFKA_CLIENT_ID || 'streambridge';

        // SSL configuration (if enabled)
        let ssl = undefined;
        if (process.env.KAFKA_USE_SSL === 'true') {
            ssl = {
                rejectUnauthorized: process.env.KAFKA_REJECT_UNAUTHORIZED !== 'false',
                ca: process.env.KAFKA_CA_CERT ? [process.env.KAFKA_CA_CERT] : undefined,
                key: process.env.KAFKA_CLIENT_KEY || undefined,
                cert: process.env.KAFKA_CLIENT_CERT || undefined,
            };
        }

        // SASL authentication (if enabled)
        let sasl = undefined;
        if (process.env.KAFKA_USE_SASL === 'true') {
            sasl = {
                mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
                username: process.env.KAFKA_SASL_USERNAME,
                password: process.env.KAFKA_SASL_PASSWORD,
            };
        }

        // Create Kafka client
        const kafka = new Kafka({
            clientId,
            brokers,
            ssl,
            sasl,
            connectionTimeout: parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '30000'), // 30 seconds
            requestTimeout: parseInt(process.env.KAFKA_REQUEST_TIMEOUT || '30000'), // 30 seconds
            retry: {
                initialRetryTime: 300,
                retries: 10
            }
        });

        return kafka;
    } catch (error) {
        logger.error('Error creating Kafka client:', error);
        throw error;
    }
};

// Global Kafka client instance
let kafkaClient = null;
let producer = null;
let consumers = [];

// Connect to Kafka
const connectKafka = async () => {
    try {
        if (!kafkaClient) {
            kafkaClient = createKafkaClient();
            logger.info('Kafka client created');
        }

        // Initialize producer
        producer = kafkaClient.producer({
            allowAutoTopicCreation: process.env.KAFKA_AUTO_CREATE_TOPICS === 'true',
            idempotent: true,
            transactionalId: process.env.KAFKA_TRANSACTIONAL_ID || undefined
        });

        await producer.connect();
        logger.info('Kafka producer connected');

        return true;
    } catch (error) {
        logger.error('Failed to connect to Kafka:', error);
        throw error;
    }
};

// Disconnect from Kafka
const disconnectKafka = async () => {
    try {
        // Disconnect all consumers
        if (consumers.length > 0) {
            await Promise.all(consumers.map(consumer => consumer.disconnect()));
            logger.info('Kafka consumers disconnected');
        }

        // Disconnect producer
        if (producer) {
            await producer.disconnect();
            logger.info('Kafka producer disconnected');
        }

        // Clear references
        kafkaClient = null;
        producer = null;
        consumers = [];

        return true;
    } catch (error) {
        logger.error('Error disconnecting from Kafka:', error);
        throw error;
    }
};

// Create and connect a consumer
const createConsumer = async (groupId, topics, messageHandler) => {
    try {
        if (!kafkaClient) {
            throw new Error('Kafka client not initialized');
        }

        const consumer = kafkaClient.consumer({
            groupId: groupId || `streambridge-${Date.now()}`,
            sessionTimeout: parseInt(process.env.KAFKA_SESSION_TIMEOUT || '30000'),
            heartbeatInterval: parseInt(process.env.KAFKA_HEARTBEAT_INTERVAL || '3000'),
        });

        await consumer.connect();

        // Subscribe to topics
        await consumer.subscribe({
            topics: Array.isArray(topics) ? topics : [topics],
            fromBeginning: process.env.KAFKA_READ_FROM_BEGINNING === 'true'
        });

        // Start consuming
        await consumer.run({
            partitionsConsumedConcurrently: parseInt(process.env.KAFKA_PARTITIONS_CONSUMED_CONCURRENTLY || '1'),
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const key = message.key ? message.key.toString() : null;

                    // Decrypt message if encryption is enabled
                    let value;
                    if (process.env.ENCRYPT_MESSAGES === 'true' && message.value) {
                        value = decryptData(message.value.toString());
                    } else {
                        value = message.value ? message.value.toString() : null;
                    }

                    // Process message
                    await messageHandler({
                        topic,
                        partition,
                        offset: message.offset,
                        timestamp: message.timestamp,
                        key,
                        value,
                        headers: message.headers
                    });
                } catch (error) {
                    logger.error(`Error processing Kafka message from ${topic}:`, error);
                    // Handle message processing error (e.g., send to error queue)
                    const errorQueueHandler = require('../messaging/errorQueue');
                    await errorQueueHandler.handleFailedMessage('kafka', {
                        topic,
                        message,
                        error: error.message
                    });
                }
            }
        });

        // Add consumer to the list
        consumers.push(consumer);
        logger.info(`Kafka consumer connected to topics: ${topics}`);

        return consumer;
    } catch (error) {
        logger.error('Error creating Kafka consumer:', error);
        throw error;
    }
};

// Publish message to Kafka
const publishMessage = async (topic, message, key = null, headers = {}) => {
    try {
        if (!producer) {
            throw new Error('Kafka producer not initialized');
        }

        // Encrypt message if encryption is enabled
        let messageValue;
        if (process.env.ENCRYPT_MESSAGES === 'true') {
            if (typeof message === 'object') {
                messageValue = encryptData(JSON.stringify(message));
            } else {
                messageValue = encryptData(message.toString());
            }
        } else {
            if (typeof message === 'object') {
                messageValue = JSON.stringify(message);
            } else {
                messageValue = message.toString();
            }
        }

        // Prepare message
        const kafkaMessage = {
            topic,
            messages: [{
                key: key ? key.toString() : null,
                value: messageValue,
                headers
            }]
        };

        // Send message
        const result = await producer.send(kafkaMessage);
        logger.debug(`Message published to Kafka topic ${topic}`);

        return result;
    } catch (error) {
        logger.error(`Error publishing message to Kafka topic ${topic}:`, error);
        throw error;
    }
};

module.exports = {
    connectKafka,
    disconnectKafka,
    createConsumer,
    publishMessage,
    getKafkaClient: () => kafkaClient,
    getProducer: () => producer
};