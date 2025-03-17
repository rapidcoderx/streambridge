// messageValidator.js - Message schema validation
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { logger } = require('../../utils/logger');

// Initialize JSON schema validator
const ajv = new Ajv({
    allErrors: true,
    removeAdditional: 'all',
    useDefaults: true,
    coerceTypes: true,
    strict: false
});

// Add string formats like date-time, email, etc.
addFormats(ajv);

// Schema cache
const schemaCache = new Map();

// Custom formats (can be extended)
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

// Load message schemas from configuration or file system
const loadSchemas = async () => {
    try {
        logger.info('Loading message schemas');

        // In a real application, you would load schemas from files or a schema registry
        // For this example, we'll define some basic schemas inline

        // Sample schemas
        const schemas = {
            'default': {
                type: 'object',
                additionalProperties: true
            },
            'order': {
                type: 'object',
                required: ['orderId', 'items', 'customer'],
                properties: {
                    orderId: { type: 'string' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['productId', 'quantity'],
                            properties: {
                                productId: { type: 'string' },
                                name: { type: 'string' },
                                quantity: { type: 'number', minimum: 1 },
                                price: { type: 'number', minimum: 0 }
                            }
                        }
                    },
                    customer: {
                        type: 'object',
                        required: ['id'],
                        properties: {
                            id: { type: 'string' },
                            email: { type: 'string', format: 'email' },
                            name: { type: 'string' }
                        }
                    },
                    timestamp: { type: 'string', format: 'date-time' },
                    totalAmount: { type: 'number', minimum: 0 }
                }
            },
            'notification': {
                type: 'object',
                required: ['type', 'message'],
                properties: {
                    type: { type: 'string', enum: ['info', 'warning', 'error', 'success'] },
                    message: { type: 'string', minLength: 1 },
                    timestamp: { type: 'string', format: 'date-time' },
                    targetUser: { type: 'string' },
                    metadata: {
                        type: 'object',
                        additionalProperties: true
                    }
                }
            },
            'log': {
                type: 'object',
                required: ['level', 'message'],
                properties: {
                    level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
                    message: { type: 'string' },
                    timestamp: { type: 'string', format: 'date-time' },
                    service: { type: 'string' },
                    traceId: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: true
                    }
                }
            },
            'event': {
                type: 'object',
                required: ['eventType', 'data'],
                properties: {
                    eventType: { type: 'string' },
                    data: {
                        type: 'object',
                        additionalProperties: true
                    },
                    timestamp: { type: 'string', format: 'date-time' },
                    source: { type: 'string' },
                    id: { type: 'string' }
                }
            }
        };

        // Compile and cache schemas
        for (const [schemaName, schema] of Object.entries(schemas)) {
            schemaCache.set(schemaName, ajv.compile(schema));
        }

        logger.info(`Loaded ${schemaCache.size} message schemas`);
    } catch (error) {
        logger.error('Error loading message schemas:', error);
        throw error;
    }
};

// Load schemas on module initialization
loadSchemas();

// Validate message against schema
const validateMessage = async (messageType, message) => {
    try {
        // Get the validator for the message type
        let validator = schemaCache.get(messageType);

        // If no specific schema exists, use default schema
        if (!validator) {
            logger.debug(`No schema found for message type ${messageType}, using default schema`);
            validator = schemaCache.get('default');

            // If no default schema, create a permissive one
            if (!validator) {
                validator = ajv.compile({ type: 'object', additionalProperties: true });
                schemaCache.set('default', validator);
            }
        }

        // Validate message
        const valid = validator(message);

        if (!valid) {
            return {
                valid: false,
                errors: validator.errors,
                error: ajv.errorsText(validator.errors)
            };
        }

        return { valid: true };
    } catch (error) {
        logger.error(`Error validating message of type ${messageType}:`, error);
        return {
            valid: false,
            errors: [{ message: error.message }],
            error: error.message
        };
    }
};

// Add a new schema
const addSchema = async (schemaName, schema) => {
    try {
        // Compile and cache the schema
        const validator = ajv.compile(schema);
        schemaCache.set(schemaName, validator);

        logger.info(`Added schema for message type: ${schemaName}`);
        return true;
    } catch (error) {
        logger.error(`Error adding schema for ${schemaName}:`, error);
        throw error;
    }
};

// Get a list of available schemas
const getAvailableSchemas = () => {
    return Array.from(schemaCache.keys());
};

module.exports = {
    validateMessage,
    addSchema,
    getAvailableSchemas,
    reloadSchemas: loadSchemas
};