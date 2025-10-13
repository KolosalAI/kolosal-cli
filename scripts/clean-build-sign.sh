#!/bin/bash

##
# Clean rebuild and sign macOS package
# This script performs a complete clean build from scratch
##

set -e

echo "🧹 Clean Rebuild & Sign Script"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC}  $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Clean all build artifacts
print_step "Cleaning build artifacts..."
echo ""

if [ -d "dist" ]; then
    echo "   Removing dist/"
    rm -rf dist
fi

if [ -d ".pkgroot" ]; then
    echo "   Removing .pkgroot/"
    rm -rf .pkgroot
fi

if [ -d "kolosal-server/build" ]; then
    echo "   Removing kolosal-server/build/"
    rm -rf kolosal-server/build
fi

if [ -d "bundle" ]; then
    echo "   Removing bundle/"
    rm -rf bundle
fi

# Clean node_modules in packages (optional, comment out if you want to keep)
# print_warning "Cleaning node_modules (this will require npm install)..."
# rm -rf node_modules packages/*/node_modules

echo ""
print_step "✓ Clean complete"
echo ""

# Step 2: Install dependencies (if needed)
if [ ! -d "node_modules" ]; then
    print_step "Installing dependencies..."
    npm install
    echo ""
fi

# Step 3: Build the project
print_step "Building project..."
npm run build
echo ""

# Step 4: Set up code signing identities
print_step "Setting up code signing..."

# Use environment variables if set, otherwise empty (will skip signing)
export CODESIGN_IDENTITY_APP="${CODESIGN_IDENTITY_APP:-}"
export CODESIGN_IDENTITY="${CODESIGN_IDENTITY:-}"
export NOTARIZE="${NOTARIZE:-0}"

if [ -n "$CODESIGN_IDENTITY_APP" ]; then
    echo "   Application cert: $CODESIGN_IDENTITY_APP"
else
    echo "   Application cert: Not set (binaries will not be signed)"
fi

if [ -n "$CODESIGN_IDENTITY" ]; then
    echo "   Installer cert: $CODESIGN_IDENTITY"
else
    echo "   Installer cert: Not set (package will not be signed)"
fi

echo "   Notarization: $([ "$NOTARIZE" = "1" ] && echo "enabled" || echo "disabled")"
echo ""

# Step 5: Verify certificates are available
print_step "Verifying certificates..."

if [ -n "$CODESIGN_IDENTITY_APP" ]; then
    if ! security find-identity -v -p codesigning | grep -q "Developer ID Application"; then
        print_warning "Developer ID Application certificate not found in keychain!"
        echo "   The specified identity may not be available"
        echo "   Run: security find-identity -v -p codesigning"
    else
        echo "   ✓ Application certificate found"
    fi
else
    print_warning "No application signing identity specified"
    echo "   Binaries will not be signed"
fi

if [ -n "$CODESIGN_IDENTITY" ]; then
    if security find-identity -v -p codesigning | grep -q "Developer ID Installer"; then
        echo "   ✓ Installer certificate found"
    else
        print_warning "Installer certificate not found (package won't be signed)"
        echo "   The .pkg will be created but not signed for distribution"
    fi
else
    print_warning "No installer signing identity specified"
    echo "   Package will not be signed"
fi

echo ""

# Step 6: Flush DNS cache (to avoid timestamp server issues)
print_step "Flushing DNS cache..."
sudo dscacheutil -flushcache 2>/dev/null || true
sudo killall -HUP mDNSResponder 2>/dev/null || true
echo "   ✓ DNS cache flushed"
echo ""

# Step 7: Build and sign the package
print_step "Building macOS package..."
echo ""
node scripts/build-standalone-pkg.js

echo ""
echo "================================"
echo -e "${GREEN}✨ Build Complete!${NC}"
echo ""
echo "📦 Package location:"
echo "   dist/mac/KolosalCode-macos-signed.pkg"
echo ""
echo "📝 To install:"
echo "   sudo installer -pkg dist/mac/KolosalCode-macos-signed.pkg -target /"
echo ""
echo "🧪 To test before installing:"
echo "   ./dist/mac/kolosal-app/bin/kolosal --version"
echo ""
echo "🔍 To verify signature:"
echo "   pkgutil --check-signature dist/mac/KolosalCode-macos-signed.pkg"
echo ""
