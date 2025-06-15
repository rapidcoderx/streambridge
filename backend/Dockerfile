# Backend Dockerfile
FROM node:lts-bookworm-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# From here we load our application's code
FROM node:lts-bookworm-slim AS runtime

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

# Create app directory and set to non-root user
WORKDIR /app
RUN groupadd -g 1001 appuser && \
    useradd -u 1001 -g appuser -m appuser && \
    chown -R appuser:appuser /app

# Set environment variables
ENV NODE_ENV=production

# Copy built dependencies from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Copy application code
COPY --chown=appuser:appuser . .

# Create logs directory with correct permissions
RUN mkdir -p logs && chown -R appuser:appuser logs

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 5045

# Use dumb-init as entrypoint to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "src/server.js"]