#!/data/data/com.termux/files/usr/bin/bash
# Build script for Kolosal CLI on Termux

set -e  # Exit on any error

echo "Kolosal CLI Build Script for Termux"
echo "==================================="

# Check if we're in the right directory
if [ ! -f "CMakeLists.txt" ]; then
    echo "Error: CMakeLists.txt not found. Please run this script from the kolosal-cli root directory."
    exit 1
fi

echo "Checking for required dependencies..."

# Check for required packages
for cmd in cmake make clang pkg-config; do
    if ! command -v $cmd >/dev/null 2>&1; then
        echo "Error: Required command '$cmd' not found."
        echo "Please install it with: pkg install cmake make clang pkg-config -y"
        exit 1
    fi
done

echo "All required dependencies found."

# Check for required libraries
echo "Checking for required libraries..."
for lib in libcurl openssl zlib; do
    if ! pkg list-installed | grep -q "^$lib/"; then
        echo "Warning: Library '$lib' not found. Installing..."
        pkg install $lib -y
    fi
done

echo "All required libraries are available."

# Initialize and update main submodules if needed
echo "Initializing and updating submodules..."
if [ ! -d "kolosal-server" ] || [ ! -d "kolosal-server/.git" ]; then
    echo "Initializing main submodules..."
    git submodule init
    git submodule update
fi

# Check if kolosal-server/.gitmodules exists and initialize its submodules
if [ -f "kolosal-server/.gitmodules" ]; then
    echo "Initializing kolosal-server submodules..."
    cd kolosal-server
    git submodule init
    git submodule update
    cd ..
else
    echo "Warning: kolosal-server/.gitmodules not found. This might cause build issues."
fi

# Create build directory if it doesn't exist
echo "Setting up build directory..."
mkdir -p build
cd build

# Configure with CMake
echo "Configuring with CMake..."
cmake .. -DCMAKE_BUILD_TYPE=Release

# Build the project
echo "Building Kolosal CLI (this may take a while)..."
make -j4

# Check if build was successful
if [ ! -f "bin/kolosal" ]; then
    echo "Error: Build failed. kolosal executable not found in build/bin/"
    exit 1
fi

echo ""
echo "Build successful!"
echo "================"
echo "Kolosal CLI has been built successfully."
echo ""
echo "To run directly:"
echo "  ./bin/kolosal"
echo ""
echo "To install globally (so you can run 'kolosal' from anywhere):"
echo "  cd .. && ./install-kolosal-termux.sh"
echo ""