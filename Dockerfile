# Use Node.js 20 as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY packages/api-server/package.json ./packages/api-server/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S kolosal -u 1001

# Change ownership of the app directory
RUN chown -R kolosal:nodejs /app
USER kolosal

# Expose port 8080
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(() => process.exit(0)).catch(() => process.exit(1))"

# Start the application
CMD ["npm", "run", "start:server"]