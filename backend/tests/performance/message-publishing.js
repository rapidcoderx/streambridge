// message-publishing.js - K6 performance test for message publishing
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');

// Test configuration
export const options = {
    // Test scenarios
    scenarios: {
        // Smoke test - low load
        smoke: {
            executor: 'constant-vus',
            vus: 5,
            duration: '30s',
            tags: { test_type: 'smoke' },
        },
        // Load test - moderate load, increasing
        load: {
            executor: 'ramping-vus',
            startVUs: 10,
            stages: [
                { duration: '1m', target: 50 },
                { duration: '2m', target: 50 },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '30s',
            tags: { test_type: 'load' },
        },
        // Stress test - high load
        stress: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 500,
            stages: [
                { duration: '1m', target: 50 },
                { duration: '2m', target: 100 },
                { duration: '1m', target: 200 },
                { duration: '1m', target: 50 },
            ],
            tags: { test_type: 'stress' },
        },
        // Soak test - long duration, moderate load
        soak: {
            executor: 'constant-vus',
            vus: 30,
            duration: '10m',
            tags: { test_type: 'soak' },
        },
        // Spike test - very high load for a short time
        spike: {
            executor: 'ramping-arrival-rate',
            startRate: 10,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 1000,
            stages: [
                { duration: '10s', target: 10 },
                { duration: '30s', target: 500 },
                { duration: '1m', target: 500 },
                { duration: '30s', target: 10 },
            ],
            tags: { test_type: 'spike' },
        },
    },
    // Thresholds for test metrics
    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<1000'],
        http_req_failed: ['rate<0.05'],
        error_rate: ['rate<0.05'],
    },
};

// Test setup - generate auth token
const getAuthToken = () => {
    const loginUrl = 'http://localhost:5045/api/auth/login';
    const payload = JSON.stringify({
        username: 'admin',
        password: 'admin123'
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const response = http.post(loginUrl, payload, params);

    check(response, {
        'Login successful': (r) => r.status === 200,
        'Token received': (r) => r.json().token !== undefined,
    });

    return response.json().token;
};

// Generate random message data
const generateMessage = () => {
    return {
        id: `msg-${Math.floor(Math.random() * 1000000)}`,
        timestamp: new Date().toISOString(),
        value: Math.random() * 100,
        type: ['sensor', 'event', 'log', 'notification'][Math.floor(Math.random() * 4)],
        source: ['device1', 'device2', 'server1', 'gateway', 'api'][Math.floor(Math.random() * 5)],
        data: {
            field1: Math.random() * 1000,
            field2: Math.random() * 1000,
            active: Math.random() > 0.5,
            text: `Message text ${Math.floor(Math.random() * 1000)}`
        }
    };
};

// Setup code that runs once per VU
export function setup() {
    // Get authentication token (if needed)
    return {
        token: getAuthToken(),
        kafkaDestinations: ['messages', 'events', 'logs', 'notifications'],
        rabbitmqDestinations: ['tasks', 'notifications', 'emails']
    };
}

// Test function executed by each VU
export default function(data) {
    // Choose a random destination based on protocol
    const useKafka = Math.random() > 0.5;

    const destinationArray = useKafka ? data.kafkaDestinations : data.rabbitmqDestinations;
    const destination = destinationArray[Math.floor(Math.random() * destinationArray.length)];
    const protocol = useKafka ? 'kafka' : 'rabbitmq';

    // Prepare request data
    const url = 'http://localhost:5045/api/messages';
    const payload = JSON.stringify({
        destination: `${protocol}://${destination}`,
        message: generateMessage(),
        messageType: 'performance-test',
        routingKey: useKafka ? undefined : 'test.performance',
        options: {
            broadcast: false
        }
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`
        },
    };

    // Send message
    const response = http.post(url, payload, params);

    // Check if the request was successful
    const success = check(response, {
        'Status is 200': (r) => r.status === 200,
        'Response has transactionId': (r) => r.json().transactionId !== undefined,
    });

    // Track error rate
    errorRate.add(!success);

    // Add some random sleep time to simulate real-world usage
    sleep(Math.random() * 0.5);
}

// Teardown code that runs at the end of the test
export function teardown(data) {
    // Clean up if needed
    console.log('Test completed successfully');
}