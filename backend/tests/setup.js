// setup.js - Jest setup file

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.LOG_LEVEL = 'error';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes-long-a';
process.env.VALIDATE_MESSAGES = 'true';
process.env.ENCRYPT_MESSAGES = 'false';
process.env.METRICS_ENABLED = 'false';
process.env.LOG_TO_FILE = 'false';
process.env.WEBSOCKET_AUTH_REQUIRED = 'false';
process.env.RABBITMQ_USERNAME = 'guest';
process.env.RABBITMQ_PASSWORD = 'guest';
process.env.RABBITMQ_HOST = 'localhost';
process.env.RABBITMQ_PORT = '5672';
process.env.KAFKA_BROKERS = 'localhost:9092';

// Add more environment variables as needed for testing

// Add test-wide global setup
beforeAll(() => {
    // Global setup before all tests
    console.log('Starting test suite');
});

afterAll(() => {
    // Global teardown after all tests
    console.log('Test suite completed');
});