#!/bin/bash

##
# Build and notarize macOS package with code signing
# This script sets up the required environment variables for code signing and notarization
#
# Usage:
#   ./scripts/build-mac-pkg-signed.sh          # Normal build
#   ./scripts/build-mac-pkg-signed.sh --clean  # Clean build
##

set -e

# Check for clean flag
CLEAN_BUILD=0
if [ "$1" = "--clean" ] || [ "$1" = "-c" ]; then
    CLEAN_BUILD=1
    echo "🧹 Clean build mode enabled"
    echo ""
fi

# Clean if requested
if [ $CLEAN_BUILD -eq 1 ]; then
    echo "🗑️  Cleaning build artifacts..."
    rm -rf dist .pkgroot kolosal-server/build bundle
    echo "   ✓ Cleaned"
    echo ""
    
    # Flush DNS cache
    echo "🔄 Flushing DNS cache..."
    sudo dscacheutil -flushcache 2>/dev/null || true
    sudo killall -HUP mDNSResponder 2>/dev/null || true
    echo "   ✓ DNS cache flushed"
    echo ""
fi

echo "🔐 Setting up code signing identities..."

# Use environment variables if already set, otherwise leave empty (will skip signing)
# To enable signing, set these environment variables before running this script:
#   export CODESIGN_IDENTITY_APP="Developer ID Application: Your Name (TEAM_ID)"
#   export CODESIGN_IDENTITY="Developer ID Installer: Your Name (TEAM_ID)"
#   export NOTARIZE=1

export CODESIGN_IDENTITY_APP="${CODESIGN_IDENTITY_APP:-}"
export CODESIGN_IDENTITY="${CODESIGN_IDENTITY:-}"

# Enable notarization (set to 0 to skip)
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

# Build the package
echo ""
echo "🚀 Building macOS package..."
node scripts/build-standalone-pkg.js

echo ""
echo "✅ Done!"
