#!/bin/bash

# Build and Push Docker Image Script
# This script builds the Docker image locally and pushes it to Docker Hub

set -e  # Exit on any error

echo "🐳 Building and pushing Docker image for avr-sts-openai..."

# Get the version from package.json
VERSION=$(node -p "require('./package.json').version")
IMAGE_NAME="cierrateam/avr-sts-openai"

echo "📦 Version: $VERSION"
echo "🏷️  Image: $IMAGE_NAME"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if user is logged into Docker Hub
if ! docker info | grep -q "Username:"; then
    echo "⚠️  You may need to login to Docker Hub first:"
    echo "   docker login"
    echo ""
fi

echo "🔨 Building Docker image for linux/amd64 platform..."
docker build --platform=linux/amd64 \
    -t $IMAGE_NAME:latest \
    -t $IMAGE_NAME:$VERSION \
    .

echo "✅ Build completed successfully!"

echo "📤 Pushing images to Docker Hub..."
docker push $IMAGE_NAME:latest
docker push $IMAGE_NAME:$VERSION

echo "🎉 Successfully built and pushed:"
echo "   - $IMAGE_NAME:latest"
echo "   - $IMAGE_NAME:$VERSION"

echo ""
echo "🚀 You can now run the container with:"
echo "   docker run -p 6030:6030 --env-file .env $IMAGE_NAME:latest"
