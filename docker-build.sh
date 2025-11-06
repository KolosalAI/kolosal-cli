#!/bin/bash

# Build script for Kolosal AI API Server Docker image

set -e

# Configuration
IMAGE_NAME="kolosal-ai/api-server"
TAG=${1:-latest}
FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"

echo "Building Docker image: $FULL_IMAGE_NAME"

# Build the Docker image
docker build -t "$FULL_IMAGE_NAME" .

echo "✅ Successfully built Docker image: $FULL_IMAGE_NAME"

# Show image info
echo ""
echo "Image details:"
docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}"

echo ""
echo "To run the container:"
echo "  docker run -p 8080:8080 $FULL_IMAGE_NAME"
echo ""
echo "Or use docker-compose:"
echo "  docker-compose up -d"
echo ""
echo "Health check:"
echo "  curl http://localhost:8080/healthz"