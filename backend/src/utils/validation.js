// validation.js - Utility functions for validation
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { logger } = require('./logger');

// Initialize JSON Schema validator
const ajv = new Ajv({
    allErrors: true,
    useDefaults: true,
    coerceTypes: true,
    removeAdditional: false
});

// Add string formats
addFormats(ajv);

// Add custom formats
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat('iso-date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);

/**
 * Validate data against a JSON schema
 * @param {object} schema - JSON Schema to validate against
 * @param {any} data - Data to validate
 * @returns {object} - Validation result
 */
const validateAgainstSchema = (schema, data) => {
    try {
        // Compile schema
        const validate = ajv.compile(schema);

        // Validate data
        const valid = validate(data);

        if (!valid) {
            return {
                valid: false,
                errors: validate.errors,
                errorMessage: ajv.errorsText(validate.errors)
            };
        }

        return {
            valid: true,
            data
        };
    } catch (error) {
        logger.error('Schema validation error:', error);

        return {
            valid: false,
            error: error.message,
            errorMessage: `Schema validation failed: ${error.message}`
        };
    }
};

/**
 * Validate an object's properties
 * @param {object} obj - Object to validate
 * @param {object} validations - Validation rules for properties
 * @returns {object} - Validation result
 */
const validateObject = (obj, validations) => {
    const errors = {};
    let isValid = true;

    // Check each property with its validation rule
    for (const [prop, rule] of Object.entries(validations)) {
        const value = obj[prop];

        // Skip if property doesn't exist and is not required
        if (value === undefined && !rule.required) {
            continue;
        }

        // Check required
        if (rule.required && (value === undefined || value === null || value === '')) {
            errors[prop] = 'This field is required';
            isValid = false;
            continue;
        }

        // Skip further validation if value is empty
        if (value === undefined || value === null || value === '') {
            continue;
        }

        // Check type
        if (rule.type) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;

            if (actualType !== rule.type) {
                errors[prop] = `Must be of type ${rule.type}`;
                isValid = false;
                continue;
            }
        }

        // String validations
        if (typeof value === 'string') {
            // Minimum length
            if (rule.minLength !== undefined && value.length < rule.minLength) {
                errors[prop] = `Must be at least ${rule.minLength} characters long`;
                isValid = false;
                continue;
            }

            // Maximum length
            if (rule.maxLength !== undefined && value.length > rule.maxLength) {
                errors[prop] = `Must be at most ${rule.maxLength} characters long`;
                isValid = false;
                continue;
            }

            // Regex pattern
            if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
                errors[prop] = rule.patternMessage || 'Invalid format';
                isValid = false;
                continue;
            }

            // Email format
            if (rule.format === 'email' && !isValidEmail(value)) {
                errors[prop] = 'Must be a valid email address';
                isValid = false;
                continue;
            }

            // URL format
            if (rule.format === 'url' && !isValidUrl(value)) {
                errors[prop] = 'Must be a valid URL';
                isValid = false;
                continue;
            }

            // Date format
            if (rule.format === 'date' && !isValidDate(value)) {
                errors[prop] = 'Must be a valid date';
                isValid = false;
                continue;
            }

            // Enum values
            if (rule.enum && !rule.enum.includes(value)) {
                errors[prop] = `Must be one of: ${rule.enum.join(', ')}`;
                isValid = false;
                continue;
            }
        }

        // Number validations
        if (typeof value === 'number') {
            // Minimum value
            if (rule.minimum !== undefined && value < rule.minimum) {
                errors[prop] = `Must be at least ${rule.minimum}`;
                isValid = false;
                continue;
            }

            // Maximum value
            if (rule.maximum !== undefined && value > rule.maximum) {
                errors[prop] = `Must be at most ${rule.maximum}`;
                isValid = false;
                continue;
            }

            // Integer only
            if (rule.integer && !Number.isInteger(value)) {
                errors[prop] = 'Must be an integer';
                isValid = false;
                continue;
            }
        }

        // Array validations
        if (Array.isArray(value)) {
            // Minimum items
            if (rule.minItems !== undefined && value.length < rule.minItems) {
                errors[prop] = `Must contain at least ${rule.minItems} items`;
                isValid = false;
                continue;
            }

            // Maximum items
            if (rule.maxItems !== undefined && value.length > rule.maxItems) {
                errors[prop] = `Must contain at most ${rule.maxItems} items`;
                isValid = false;
                continue;
            }

            // Unique items
            if (rule.uniqueItems && new Set(value).size !== value.length) {
                errors[prop] = 'Must contain unique items';
                isValid = false;
                continue;
            }

            // Item validations
            if (rule.items && value.length > 0) {
                const itemErrors = [];

                for (let i = 0; i < value.length; i++) {
                    const item = value[i];

                    if (typeof rule.items === 'object' && rule.items !== null) {
                        // Validate each item against schema
                        const itemValidation = validateObject(item, rule.items);

                        if (!itemValidation.isValid) {
                            itemErrors.push({ index: i, errors: itemValidation.errors });
                        }
                    }
                }

                if (itemErrors.length > 0) {
                    errors[prop] = { items: itemErrors };
                    isValid = false;
                    continue;
                }
            }
        }

        // Object validations
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Nested validations
            if (rule.properties) {
                const nestedValidation = validateObject(value, rule.properties);

                if (!nestedValidation.isValid) {
                    errors[prop] = nestedValidation.errors;
                    isValid = false;
                    continue;
                }
            }
        }

        // Custom validation function
        if (rule.validate && typeof rule.validate === 'function') {
            const customResult = rule.validate(value, obj);

            if (customResult !== true) {
                errors[prop] = customResult || 'Invalid value';
                isValid = false;
                continue;
            }
        }
    }

    return {
        isValid,
        errors
    };
};

/**
 * Check if a value is a valid email address
 * @param {string} email - Email address to validate
 * @returns {boolean} - Validation result
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(email).toLowerCase());
};

/**
 * Check if a value is a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} - Validation result
 */
const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Check if a value is a valid date
 * @param {string} date - Date string to validate
 * @returns {boolean} - Validation result
 */
const isValidDate = (date) => {
    const parsedDate = new Date(date);
    return !isNaN(parsedDate.getTime());
};

/**
 * Sanitize input to prevent common injection attacks
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized input
 */
const sanitizeInput = (input) => {
    if (typeof input !== 'string') {
        return input;
    }

    // Replace potentially dangerous characters
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .replace(/\\/g, '&#x5C;')
        .replace(/`/g, '&#96;');
};

/**
 * Deep sanitize an object's string properties
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    // Handle objects
    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeInput(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeObject(value);
        } else {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

/**
 * Detect SQL injection attempts
 * @param {string} input - Input to check
 * @returns {boolean} - True if potential SQL injection is detected
 */
const detectSqlInjection = (input) => {
    if (typeof input !== 'string') {
        return false;
    }

    const sqlPatterns = [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,  // Basic SQL meta-characters
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i, // Basic SQL injection
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // Basic SQL OR attacks
        /((\%27)|(\'))union/i // Basic SQL UNION attacks
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
};

/**
 * Detect XSS injection attempts
 * @param {string} input - Input to check
 * @returns {boolean} - True if potential XSS injection is detected
 */
const detectXssInjection = (input) => {
    if (typeof input !== 'string') {
        return false;
    }

    const xssPatterns = [
        /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i, // Basic XSS
        /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i, // Basic img tags
        /((\%3C)|<)[^\n]+((\%3E)|>)/i // Any HTML tags
    ];

    return xssPatterns.some(pattern => pattern.test(input));
};

/**
 * Check for security vulnerabilities in input
 * @param {string} input - Input to check
 * @returns {object} - Vulnerability check result
 */
const checkSecurityVulnerabilities = (input) => {
    if (typeof input !== 'string') {
        return { safe: true };
    }

    const vulnerabilities = [];

    if (detectSqlInjection(input)) {
        vulnerabilities.push('SQL_INJECTION');
    }

    if (detectXssInjection(input)) {
        vulnerabilities.push('XSS');
    }

    return {
        safe: vulnerabilities.length === 0,
        vulnerabilities
    };
};

module.exports = {
    validateAgainstSchema,
    validateObject,
    isValidEmail,
    isValidUrl,
    isValidDate,
    sanitizeInput,
    sanitizeObject,
    detectSqlInjection,
    detectXssInjection,
    checkSecurityVulnerabilities
};