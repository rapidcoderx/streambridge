// messageApi.test.js - Integration tests for the message API
const request = require('supertest');
const { jest } = require('@jest/globals');
const app = require('../../../src/app');

// Mock Kafka and RabbitMQ connections to avoid actual connections during tests
jest.mock('../../../src/config/kafka', () => ({
    connectKafka: jest.fn().mockResolvedValue(true),
    disconnectKafka: jest.fn().mockResolvedValue(true),
    createConsumer: jest.fn().mockResolvedValue({}),
    publishMessage: jest.fn().mockResolvedValue({ success: true }),
    getKafkaClient: jest.fn().mockReturnValue({}),
    getProducer: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/config/rabbitmq', () => ({
    connectRabbitMQ: jest.fn().mockResolvedValue(true),
    disconnectRabbitMQ: jest.fn().mockResolvedValue(true),
    createConsumer: jest.fn().mockResolvedValue({}),
    publishMessage: jest.fn().mockResolvedValue({ success: true }),
    publishToQueue: jest.fn().mockResolvedValue({ success: true }),
    getConnection: jest.fn().mockReturnValue({}),
    getProducerChannel: jest.fn().mockReturnValue({})
}));

// Mock WebSocket broadcast to avoid actual broadcasting
jest.mock('../../../src/websocket/server', () => ({
    broadcast: jest.fn(),
    getStats: jest.fn().mockReturnValue({ initialized: true, clients: 0 })
}));

// Generate a test JWT token for authentication
const generateTestToken = () => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        {
            sub: 'test-user',
            username: 'testuser',
            roles: ['user'],
            permissions: ['messages:publish', 'messages:read']
        },
        process.env.JWT_SECRET || 'test-secret',
        {
            expiresIn: '1h',
            issuer: 'streambridge-test',
            audience: 'test-client'
        }
    );
};

describe('Message API Integration Tests', () => {
    let testToken;

    beforeAll(() => {
        // Create a test token for authenticated requests
        testToken = generateTestToken();
    });

    describe('POST /api/messages', () => {
        it('should require authentication', async () => {
            // Act
            const response = await request(app)
                .post('/api/messages')
                .send({
                    destination: 'kafka://test-topic',
                    message: { test: 'data' }
                });

            // Assert
            expect(response.status).toBe(401);
        });

        it('should publish a message to Kafka', async () => {
            // Arrange
            const messageData = {
                destination: 'kafka://test-topic',
                message: { test: 'data' },
                messageType: 'test'
            };

            // Act
            const response = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${testToken}`)
                .send(messageData);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('transactionId');
            expect(response.body).toHaveProperty('destination', 'kafka://test-topic');
        });

        it('should publish a message to RabbitMQ', async () => {
            // Arrange
            const messageData = {
                destination: 'rabbitmq://test-exchange',
                message: { test: 'data' },
                messageType: 'test',
                routingKey: 'test.key'
            };

            // Act
            const response = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${testToken}`)
                .send(messageData);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('transactionId');
            expect(response.body).toHaveProperty('destination', 'rabbitmq://test-exchange');
        });

        it('should validate required fields', async () => {
            // Test missing destination
            const response1 = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    message: { test: 'data' }
                });

            expect(response1.status).toBe(400);
            expect(response1.body).toHaveProperty('message', 'Destination is required');

            // Test missing message
            const response2 = await request(app)
                .post('/api/messages')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    destination: 'kafka://test-topic'
                });

            expect(response2.status).toBe(400);
            expect(response2.body).toHaveProperty('message', 'Message content is required');
        });
    });

    describe('GET /api/messages/destinations', () => {
        it('should return available destinations', async () => {
            // Act
            const response = await request(app)
                .get('/api/messages/destinations')
                .set('Authorization', `Bearer ${testToken}`);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('kafka');
            expect(response.body).toHaveProperty('rabbitmq');
            expect(response.body.rabbitmq).toHaveProperty('queues');
            expect(response.body.rabbitmq).toHaveProperty('exchanges');
        });
    });

    describe('GET /api/messages/history', () => {
        it('should return message history', async () => {
            // Act
            const response = await request(app)
                .get('/api/messages/history')
                .query({ destination: 'kafka://test-topic', limit: 10 })
                .set('Authorization', `Bearer ${testToken}`);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('messages');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body.pagination).toHaveProperty('limit', 10);
        });

        it('should handle pagination parameters', async () => {
            // Act
            const response = await request(app)
                .get('/api/messages/history')
                .query({ destination: 'kafka://test-topic', limit: 5, offset: 10 })
                .set('Authorization', `Bearer ${testToken}`);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.pagination).toHaveProperty('limit', 5);
            expect(response.body.pagination).toHaveProperty('offset', 10);
        });
    });

    describe('GET /api/messages/schemas', () => {
        it('should return message schemas', async () => {
            // Act
            const response = await request(app)
                .get('/api/messages/schemas')
                .set('Authorization', `Bearer ${testToken}`);

            // Assert
            expect(response.status).toBe(200);
            expect(typeof response.body).toBe('object');
        });
    });

    describe('DELETE /api/messages/:destination', () => {
        it('should delete messages', async () => {
            // Act
            const response = await request(app)
                .delete('/api/messages/kafka%3A%2F%2Ftest-topic') // URL encoded kafka://test-topic
                .set('Authorization', `Bearer ${testToken}`);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
        });
    });
});