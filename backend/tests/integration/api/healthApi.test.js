// healthApi.test.js - Tests for health check endpoints
const request = require('supertest');
const app = require('../../../src/app');

// Mock dependencies
jest.mock('../../../src/config/kafka', () => ({
    getKafkaClient: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/config/rabbitmq', () => ({
    getConnection: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/websocket/server', () => ({
    getStats: jest.fn().mockReturnValue({
        initialized: true,
        clients: 5,
        topics: { 'test-topic': 2 }
    })
}));

describe('Health API Tests', () => {
    describe('GET /health', () => {
        it('should return 200 OK with basic status', async () => {
            // Act
            const response = await request(app).get('/health');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('service');
        });
    });

    describe('GET /health/detailed', () => {
        it('should return detailed health information', async () => {
            // Act
            const response = await request(app).get('/health/detailed');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('components');
            expect(response.body.components).toHaveProperty('kafka');
            expect(response.body.components).toHaveProperty('rabbitmq');
            expect(response.body.components).toHaveProperty('websocket');
            expect(response.body).toHaveProperty('system');
            expect(response.body.system).toHaveProperty('uptime');
            expect(response.body.system).toHaveProperty('memory');
            expect(response.body.system).toHaveProperty('cpu');
        });
    });

    describe('GET /health/kafka', () => {
        it('should return Kafka connection status', async () => {
            // Arrange
            const { getKafkaClient } = require('../../../src/config/kafka');

            // Case 1: Connected
            getKafkaClient.mockReturnValueOnce({});

            // Act
            const response1 = await request(app).get('/health/kafka');

            // Assert
            expect(response1.status).toBe(200);
            expect(response1.body).toHaveProperty('component', 'kafka');
            expect(response1.body).toHaveProperty('status', 'connected');

            // Case 2: Disconnected
            getKafkaClient.mockReturnValueOnce(null);

            // Act
            const response2 = await request(app).get('/health/kafka');

            // Assert
            expect(response2.status).toBe(503);
            expect(response2.body).toHaveProperty('component', 'kafka');
            expect(response2.body).toHaveProperty('status', 'disconnected');
        });
    });

    describe('GET /health/rabbitmq', () => {
        it('should return RabbitMQ connection status', async () => {
            // Arrange
            const { getConnection } = require('../../../src/config/rabbitmq');

            // Case 1: Connected
            getConnection.mockReturnValueOnce({});

            // Act
            const response1 = await request(app).get('/health/rabbitmq');

            // Assert
            expect(response1.status).toBe(200);
            expect(response1.body).toHaveProperty('component', 'rabbitmq');
            expect(response1.body).toHaveProperty('status', 'connected');

            // Case 2: Disconnected
            getConnection.mockReturnValueOnce(null);

            // Act
            const response2 = await request(app).get('/health/rabbitmq');

            // Assert
            expect(response2.status).toBe(503);
            expect(response2.body).toHaveProperty('component', 'rabbitmq');
            expect(response2.body).toHaveProperty('status', 'disconnected');
        });
    });

    describe('GET /health/websocket', () => {
        it('should return WebSocket server status', async () => {
            // Arrange
            const { getStats } = require('../../../src/websocket/server');

            // Case 1: Running
            getStats.mockReturnValueOnce({
                initialized: true,
                clients: 5,
                topics: { 'test-topic': 2 }
            });

            // Act
            const response1 = await request(app).get('/health/websocket');

            // Assert
            expect(response1.status).toBe(200);
            expect(response1.body).toHaveProperty('component', 'websocket');
            expect(response1.body).toHaveProperty('status', 'running');
            expect(response1.body).toHaveProperty('clients', 5);
            expect(response1.body).toHaveProperty('topics');

            // Case 2: Stopped
            getStats.mockReturnValueOnce({ initialized: false, clients: 0 });

            // Act
            const response2 = await request(app).get('/health/websocket');

            // Assert
            expect(response2.status).toBe(503);
            expect(response2.body).toHaveProperty('component', 'websocket');
            expect(response2.body).toHaveProperty('status', 'stopped');
        });
    });
});