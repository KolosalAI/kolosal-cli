#!/bin/bash

##
# Uninstall script for KolosalCode macOS package
# This script removes all files installed by the .pkg installer
##

set -e

echo "🗑️  Uninstalling KolosalCode..."

# Check if package is installed
if ! pkgutil --pkgs | grep -q "ai.kolosal.kolosal-code"; then
    echo "❌ KolosalCode package is not installed"
    exit 1
fi

# Show what will be removed
echo ""
echo "📋 The following will be removed:"
echo "   - /usr/local/kolosal-app (application directory)"
echo "   - /usr/local/bin/kolosal (symlink)"
echo "   - Package receipt: ai.kolosal.kolosal-code"
echo ""

# Ask for confirmation
read -p "Continue with uninstall? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Uninstall cancelled"
    exit 0
fi

# Remove the application directory
if [ -d "/usr/local/kolosal-app" ]; then
    echo "🗑️  Removing /usr/local/kolosal-app..."
    sudo rm -rf /usr/local/kolosal-app
    echo "   ✓ Removed application directory"
fi

# Remove the symlink
if [ -L "/usr/local/bin/kolosal" ]; then
    echo "🗑️  Removing /usr/local/bin/kolosal..."
    sudo rm -f /usr/local/bin/kolosal
    echo "   ✓ Removed symlink"
fi

# Forget the package
echo "🗑️  Removing package receipt..."
sudo pkgutil --forget ai.kolosal.kolosal-code
echo "   ✓ Package receipt removed"

echo ""
echo "✅ KolosalCode has been successfully uninstalled!"
echo ""
echo "Optional: You may want to remove user data/settings if they exist:"
echo "   ~/Library/Application Support/kolosal-code"
echo "   ~/Library/Preferences/ai.kolosal.kolosal-code.plist"
