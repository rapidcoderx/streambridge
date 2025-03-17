// jest.config.js - Jest configuration for testing
module.exports = {
    // The test environment to use
    testEnvironment: 'node',

    // The root directory that Jest should scan for tests
    rootDir: '.',

    // A list of paths to directories that Jest should use to search for files in
    roots: ['<rootDir>/tests'],

    // The glob patterns Jest uses to detect test files
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],

    // Don't test these directories
    testPathIgnorePatterns: [
        '/node_modules/',
        '/build/',
        '/dist/',
        '/public/'
    ],

    // Automatically clear mock calls and instances between every test
    clearMocks: true,

    // Indicates whether the coverage information should be collected while executing the test
    collectCoverage: true,

    // The directory where Jest should output its coverage files
    coverageDirectory: 'coverage',

    // Which files to include for coverage collection
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/server.js',
        '!**/node_modules/**',
        '!**/vendor/**'
    ],

    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },

    // A map from regular expressions to module names that allow to stub out resources, like images or styles
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1'
    },

    // Setup files to run before/after tests
    setupFiles: ['<rootDir>/tests/setup.js'],

    // The maximum amount of workers used to run tests
    maxWorkers: '50%',

    // Allows for custom reporters to be used
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: 'test-results',
                outputName: 'jest-junit.xml',
            }
        ]
    ],

    // Verbose output
    verbose: true,

    // Timeout for individual test cases
    testTimeout: 30000,
};