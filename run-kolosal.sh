#!/bin/bash
# Script to run Kolosal CLI from anywhere in the Termux environment

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_DIR/build"

# Check if the build exists
if [ ! -d "$BUILD_DIR" ] || [ ! -f "$BUILD_DIR/bin/kolosal" ]; then
    echo "Error: Kolosal CLI not found. Please build the project first."
    echo "Run: cd $PROJECT_DIR && mkdir -p build && cd build && cmake .. -DCMAKE_BUILD_TYPE=Release && make -j4"
    exit 1
fi

# Run the Kolosal CLI
cd "$BUILD_DIR" && ./bin/kolosal "$@"