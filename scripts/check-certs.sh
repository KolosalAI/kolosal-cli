#!/bin/bash

##
# Certificate Diagnostic Tool
# This script checks your code signing setup and helps identify issues
##

echo "🔍 Certificate Diagnostic Tool"
echo "==============================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check 1: Valid code signing identities
echo "1️⃣  Valid Code Signing Identities:"
echo "-----------------------------------"
IDENTITY_COUNT=$(security find-identity -v -p codesigning | grep -c "valid identit")
if [ "$IDENTITY_COUNT" -gt 0 ]; then
    security find-identity -v -p codesigning
    IDENTITIES=$(security find-identity -v -p codesigning | grep "Developer ID" | wc -l | tr -d ' ')
    if [ "$IDENTITIES" -ge 2 ]; then
        echo -e "${GREEN}✓ Found $IDENTITIES valid identities${NC}"
    else
        echo -e "${YELLOW}⚠️  Only found $IDENTITIES identity (you need 2: Application + Installer)${NC}"
    fi
else
    echo -e "${RED}✗ No valid identities found${NC}"
fi
echo ""

# Check 2: Certificates (with or without private keys)
echo "2️⃣  All Developer ID Certificates:"
echo "------------------------------------"
CERTS=$(security find-certificate -a -c "Developer ID" | grep "labl" | wc -l | tr -d ' ')
if [ "$CERTS" -gt 0 ]; then
    security find-certificate -a -c "Developer ID" | grep "labl"
    echo -e "${GREEN}✓ Found $CERTS Developer ID certificates${NC}"
    if [ "$CERTS" -gt "$IDENTITIES" ]; then
        echo -e "${YELLOW}⚠️  You have certificates but they're missing private keys!${NC}"
        echo "   See docs/CERTIFICATE-INSTALLATION-TROUBLESHOOTING.md for solutions"
    fi
else
    echo -e "${RED}✗ No Developer ID certificates found${NC}"
fi
echo ""

# Check 3: Private keys
echo "3️⃣  Private Keys:"
echo "-----------------"
KEYS=$(security find-identity -v -p keys 2>/dev/null | grep -c "private key")
if [ "$KEYS" -gt 0 ]; then
    echo "Found $KEYS private keys in keychain"
    # Try to show keys related to Developer ID
    security find-identity -v -p keys 2>/dev/null | grep -i "developer\|rifky\|kolosal" || echo "   (checking all keys...)"
else
    echo -e "${YELLOW}⚠️  Could not enumerate private keys${NC}"
fi
echo ""

# Check 4: Keychain setup
echo "4️⃣  Keychain Configuration:"
echo "---------------------------"
echo "Default keychain:"
security default-keychain
echo ""
echo "All keychains:"
security list-keychains
echo ""

# Check 5: Specific certificate details
echo "5️⃣  Certificate Details:"
echo "------------------------"
if security find-certificate -c "Developer ID Application" -p >/dev/null 2>&1; then
    echo "Developer ID Application certificate:"
    security find-certificate -c "Developer ID Application" -p | openssl x509 -subject -dates -noout 2>/dev/null || echo "   Could not read certificate details"
else
    echo -e "${RED}✗ No Developer ID Application certificate found${NC}"
fi
echo ""

if security find-certificate -c "Developer ID Installer" -p >/dev/null 2>&1; then
    echo "Developer ID Installer certificate:"
    security find-certificate -c "Developer ID Installer" -p | openssl x509 -subject -dates -noout 2>/dev/null || echo "   Could not read certificate details"
else
    echo -e "${RED}✗ No Developer ID Installer certificate found${NC}"
fi
echo ""

# Summary and recommendations
echo "📋 Summary & Recommendations:"
echo "============================="
echo ""

if [ "$IDENTITIES" -ge 2 ]; then
    echo -e "${GREEN}✓ Your code signing setup looks good!${NC}"
    echo ""
    echo "You have valid identities. To use them:"
    echo ""
    echo "# Copy the exact certificate names from above and run:"
    echo 'export CODESIGN_IDENTITY_APP="Developer ID Application: Your Name (TEAM_ID)"'
    echo 'export CODESIGN_IDENTITY="Developer ID Installer: Your Name (TEAM_ID)"'
    echo "./scripts/clean-build-sign.sh"
elif [ "$CERTS" -gt 0 ] && [ "$IDENTITIES" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  PROBLEM: Certificates without private keys${NC}"
    echo ""
    echo "You have Developer ID certificates but they're not linked to private keys."
    echo ""
    echo "Possible solutions:"
    echo ""
    echo "Option 1: Did you create the CSR on this Mac?"
    echo "  → The private key should be in your Keychain"
    echo "  → Try: open '/Applications/Utilities/Keychain Access.app'"
    echo "  → Look in login → Keys for a private key"
    echo "  → If found, delete the certificates and reinstall them"
    echo ""
    echo "Option 2: Did you create the CSR on a different Mac?"
    echo "  → You need to export the .p12 from that Mac"
    echo "  → Import it on this Mac"
    echo ""
    echo "Option 3: Start fresh"
    echo "  → Delete everything and create new certificates"
    echo "  → See docs/CERTIFICATE-INSTALLATION-TROUBLESHOOTING.md"
else
    echo -e "${RED}✗ PROBLEM: No certificates found${NC}"
    echo ""
    echo "You need to create and install Developer ID certificates."
    echo ""
    echo "Steps:"
    echo "1. Create CSR: Open Keychain Access → Certificate Assistant → Request Certificate"
    echo "2. Go to: https://developer.apple.com/account/resources/certificates/list"
    echo "3. Create 'Developer ID Application' certificate (upload CSR)"
    echo "4. Create 'Developer ID Installer' certificate (upload same CSR)"
    echo "5. Download and install both .cer files"
    echo ""
    echo "See docs/CERTIFICATE-ROTATION.md for detailed instructions"
fi

echo ""
echo "For detailed troubleshooting, see:"
echo "  → docs/CERTIFICATE-INSTALLATION-TROUBLESHOOTING.md"
echo "  → docs/CERTIFICATE-ROTATION.md"
echo ""
