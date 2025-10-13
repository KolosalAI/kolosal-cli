#!/bin/bash

# Code Signing Setup Script
# This helps you configure code signing for macOS packages

set -e

echo "🔐 Code Signing Setup for Kolosal Cli"
echo "========================================"
echo ""

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ This script only works on macOS"
  exit 1
fi

# Step 1: Check for certificates
echo "1️⃣  Checking for Developer ID Installer certificate..."
echo ""

if ! security find-identity -v -p basic | grep -q "Developer ID Installer"; then
  echo "❌ No Developer ID Installer certificate found!"
  echo ""
  echo "You need to:"
  echo "  1. Enroll in Apple Developer Program ($99/year)"
  echo "     https://developer.apple.com/programs/"
  echo ""
  echo "  2. Get a Developer ID Installer certificate:"
  echo "     • Option A: Open Xcode → Settings → Accounts → Manage Certificates"
  echo "     • Option B: Visit https://developer.apple.com/account/resources/certificates"
  echo ""
  echo "See docs/CODE-SIGNING.md for detailed instructions"
  exit 1
else
  echo "✅ Found Developer ID Installer certificate(s):"
  echo ""
  security find-identity -v -p basic | grep "Developer ID Installer"
  echo ""
fi

# Step 2: Get the signing identity
echo "2️⃣  Select your signing identity"
echo ""

# Extract identity names
IDENTITIES=$(security find-identity -v -p basic | grep "Developer ID Installer" | sed -E 's/.*"(.*)"/\1/')

# Count how many we found
COUNT=$(echo "$IDENTITIES" | wc -l | tr -d ' ')

if [ "$COUNT" -eq 1 ]; then
  SELECTED_IDENTITY="$IDENTITIES"
  echo "Using: $SELECTED_IDENTITY"
else
  echo "Multiple identities found. Please select one:"
  echo "$IDENTITIES" | nl
  echo ""
  read -p "Enter number (1-$COUNT): " SELECTION
  SELECTED_IDENTITY=$(echo "$IDENTITIES" | sed -n "${SELECTION}p")
fi

echo ""
echo "Selected identity:"
echo "  $SELECTED_IDENTITY"
echo ""

# Step 3: Add to shell profile
echo "3️⃣  Configure environment variables"
echo ""

SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
  SHELL_RC="$HOME/.bash_profile"
fi

if [ -z "$SHELL_RC" ]; then
  echo "⚠️  Could not detect shell, please add manually:"
else
  echo "Adding to $SHELL_RC"
  
  # Check if already configured
  if grep -q "CODESIGN_IDENTITY" "$SHELL_RC" 2>/dev/null; then
    echo "⚠️  CODESIGN_IDENTITY already exists in $SHELL_RC"
    read -p "Overwrite? (y/N): " OVERWRITE
    if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
      echo "Skipping..."
    else
      # Remove old entries
      sed -i.bak '/CODESIGN_IDENTITY/d' "$SHELL_RC"
      echo "export CODESIGN_IDENTITY=\"$SELECTED_IDENTITY\"" >> "$SHELL_RC"
      echo "✅ Updated $SHELL_RC"
    fi
  else
    echo "" >> "$SHELL_RC"
    echo "# Kolosal Cli Signing Identity" >> "$SHELL_RC"
    echo "export CODESIGN_IDENTITY=\"$SELECTED_IDENTITY\"" >> "$SHELL_RC"
    echo "✅ Added to $SHELL_RC"
  fi
fi

# Export for current session
export CODESIGN_IDENTITY="$SELECTED_IDENTITY"

echo ""
echo "To use in current session, run:"
echo "  export CODESIGN_IDENTITY=\"$SELECTED_IDENTITY\""
echo ""

# Step 4: Test signing
echo "4️⃣  Testing code signing"
echo ""

read -p "Build and sign a test package? (y/N): " TEST_BUILD

if [[ "$TEST_BUILD" == "y" || "$TEST_BUILD" == "Y" ]]; then
  echo "Building package with signing..."
  npm run build:mac:pkg
  
  echo ""
  echo "✅ Build complete! Check the output above for signing status."
else
  echo "Skipping test build"
fi

# Step 5: Notarization setup (optional)
echo ""
echo "5️⃣  Notarization Setup (Optional)"
echo ""
echo "Notarization prevents Gatekeeper warnings when users download your app."
echo ""
read -p "Set up notarization now? (y/N): " SETUP_NOTARIZE

if [[ "$SETUP_NOTARIZE" == "y" || "$SETUP_NOTARIZE" == "Y" ]]; then
  echo ""
  echo "You'll need:"
  echo "  1. Your Apple ID email"
  echo "  2. Your Team ID (find at https://developer.apple.com/account)"
  echo "  3. An app-specific password (create at https://appleid.apple.com)"
  echo ""
  
  read -p "Apple ID email: " APPLE_ID
  read -p "Team ID: " TEAM_ID
  read -sp "App-specific password: " APP_PASSWORD
  echo ""
  
  echo "Storing credentials..."
  xcrun notarytool store-credentials "notarytool-profile" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APP_PASSWORD"
  
  echo ""
  echo "✅ Notarization credentials stored!"
  echo ""
  echo "To enable notarization during build:"
  echo "  export NOTARIZE=1"
  echo "  npm run build:mac:pkg"
else
  echo "Skipping notarization setup"
  echo "You can set it up later - see docs/CODE-SIGNING.md"
fi

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. Reload your shell or run:"
echo "     source $SHELL_RC"
echo ""
echo "  2. Build a signed package:"
echo "     npm run build:mac:pkg"
echo ""
echo "  3. (Optional) Enable notarization:"
echo "     export NOTARIZE=1"
echo "     npm run build:mac:pkg"
echo ""
echo "For more details, see: docs/CODE-SIGNING.md"
