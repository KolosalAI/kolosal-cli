#!/bin/bash
# Test script for macOS .pkg installation
# This script verifies that the .pkg installs correctly

set -e

PKG_FILE="dist/mac/KolosalCode-macos.pkg"

echo "🔍 Verifying package exists..."
if [ ! -f "$PKG_FILE" ]; then
    echo "❌ Package not found at $PKG_FILE"
    echo "Please run: npm run build:mac:pkg"
    exit 1
fi

echo "✅ Package found: $PKG_FILE"
echo ""

echo "📦 Package Information:"
pkgutil --expand "$PKG_FILE" /tmp/pkg-test-expand
cat /tmp/pkg-test-expand/PackageInfo
rm -rf /tmp/pkg-test-expand
echo ""

echo "📋 Package Contents:"
pkgutil --payload-files "$PKG_FILE"
echo ""

echo "🔧 Binary Information:"
# Extract and check the binary
rm -rf /tmp/pkg-test
mkdir -p /tmp/pkg-test
cd /tmp/pkg-test
xar -xf "$OLDPWD/$PKG_FILE"
if [ -f "Payload" ]; then
    tar -xzf Payload
    if [ -f "usr/local/bin/kolosal" ]; then
        echo "✅ Binary found in package"
        lipo -info usr/local/bin/kolosal
        file usr/local/bin/kolosal
    else
        echo "❌ Binary not found at expected location"
    fi
fi
cd "$OLDPWD"
rm -rf /tmp/pkg-test
echo ""

echo "📝 Installation Instructions:"
echo ""
echo "To install the package:"
echo "  Option 1 (GUI): open $PKG_FILE"
echo "  Option 2 (CLI): sudo installer -pkg $PKG_FILE -target /"
echo ""
echo "After installation, verify with:"
echo "  kolosal --version"
echo ""
echo "To uninstall (if needed):"
echo "  sudo rm /usr/local/bin/kolosal"
echo "  sudo pkgutil --forget ai.kolosal.kolosal-code"
