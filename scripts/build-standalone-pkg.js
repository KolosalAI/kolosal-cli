#!/usr/bin/env node

/**
 * Build script for creating a standalone macOS package
 * This bundles Node.js + the application into a single directory,
 * then packages it as a .pkg installer
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));

// Node.js version to bundle
const NODE_VERSION = process.version; // Use the same version we're running
const NODE_MAJOR = NODE_VERSION.split('.')[0].substring(1); // e.g., "20"

async function bundleNodejs(nodeDir) {
  console.log(`📥 Bundling Node.js ${NODE_VERSION}...`);
  
  // Determine architecture
  const arch = process.arch; // 'arm64' or 'x64'
  const platform = process.platform; // 'darwin'
  
  // For macOS, we need to create a universal binary or download both architectures
  // For simplicity, let's use the current Node.js binary
  console.log(`   Architecture: ${arch}`);
  console.log(`   Platform: ${platform}`);
  
  // Get the current Node.js installation path
  const currentNodePath = process.execPath;
  console.log(`   Using Node.js from: ${currentNodePath}`);
  
  // Create bin directory
  const nodeBinDir = path.join(nodeDir, 'bin');
  await fs.mkdir(nodeBinDir, { recursive: true });
  
  // Copy the Node.js binary
  const targetNodePath = path.join(nodeBinDir, 'node');
  await execAsync(`cp "${currentNodePath}" "${targetNodePath}"`);
  await fs.chmod(targetNodePath, 0o755);
  
  console.log(`✅ Node.js bundled successfully`);
  
  // Verify
  try {
    const { stdout } = await execAsync(`"${targetNodePath}" --version`);
    console.log(`   Version: ${stdout.trim()}`);
  } catch (error) {
    console.error(`❌ Node.js verification failed: ${error.message}`);
    throw error;
  }
}

async function buildStandalone() {
  console.log('🔨 Building standalone macOS package (with embedded Node.js)...\n');
  
  const distDir = path.join(rootDir, 'dist', 'mac');
  const appDir = path.join(distDir, 'kolosal-app');
  const binDir = path.join(appDir, 'bin');
  const libDir = path.join(appDir, 'lib');
  const nodeDir = path.join(appDir, 'node');
  
  // Clean and create directories
  await fs.rm(appDir, { recursive: true, force: true });
  await fs.mkdir(binDir, { recursive: true });
  await fs.mkdir(libDir, { recursive: true });
  await fs.mkdir(nodeDir, { recursive: true });
  
  // Download and bundle Node.js
  await bundleNodejs(nodeDir);
  
  console.log('📦 Copying application bundle...');
  // Copy the bundle directory
  await execAsync(`cp -R "${path.join(rootDir, 'bundle')}" "${libDir}/"`);
  
  // Build and copy kolosal-server
  console.log('🔨 Building and integrating kolosal-server...');
  try {
    await execAsync('node scripts/build_kolosal_server.js', { stdio: 'inherit', cwd: rootDir });
    console.log('✅ kolosal-server integrated successfully');
  } catch (error) {
    console.warn(`⚠️  kolosal-server build failed: ${error.message}`);
    console.warn('   Continuing without kolosal-server...');
  }
  
  // Copy node_modules for external dependencies
  console.log('📚 Copying required dependencies...');
  const externals = [
    '@lydell/node-pty',
    'node-pty',
    '@lydell/node-pty-darwin-arm64',
    '@lydell/node-pty-darwin-x64',
    'tiktoken',
  ];
  
  for (const dep of externals) {
    const srcPath = path.join(rootDir, 'node_modules', dep);
    try {
      await fs.access(srcPath);
      const destPath = path.join(libDir, 'node_modules', dep);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await execAsync(`cp -R "${srcPath}" "${destPath}"`);
    } catch {
      // Dependency might not exist, skip
    }
  }
  
  // Create a launcher script
  console.log('✍️  Creating launcher script...');
  const launcher = `#!/bin/bash

# Get the directory where this script is located (resolve symlinks)
SCRIPT_PATH="\${BASH_SOURCE[0]}"
# Resolve symlinks
while [ -L "$SCRIPT_PATH" ]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
  [[ $SCRIPT_PATH != /* ]] && SCRIPT_PATH="$SCRIPT_DIR/$SCRIPT_PATH"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Use bundled Node.js
NODE_BINARY="$APP_DIR/node/bin/node"

# Set NODE_PATH to include our bundled node_modules
export NODE_PATH="$APP_DIR/lib/node_modules:$NODE_PATH"

# Execute the bundle with the bundled Node.js
exec "$NODE_BINARY" "$APP_DIR/lib/bundle/gemini.js" "$@"
`;
  
  const launcherPath = path.join(binDir, 'kolosal');
  await fs.writeFile(launcherPath, launcher);
  await fs.chmod(launcherPath, 0o755);
  
  console.log('✅ Standalone app created at:', appDir);
  
  // Bundle Homebrew dependencies
  await bundleHomebrewLibraries(libDir);
  
  // Sign native binaries if signing identity is available
  await signNativeBinaries(appDir);
  
  // Test the launcher
  console.log('\n🧪 Testing launcher...');
  try {
    const { stdout } = await execAsync(`"${launcherPath}" --version`);
    console.log(`Version: ${stdout.trim()}`);
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
    throw error;
  }
  
  return appDir;
}

async function bundleHomebrewLibraries(libDir) {
  console.log('\n📚 Bundling Homebrew dependencies...');
  
  // List of Homebrew libraries that need to be bundled
  const homebrewLibs = [
    { name: 'openssl@3', lib: 'libssl.3.dylib' },
    { name: 'openssl@3', lib: 'libcrypto.3.dylib' },
    { name: 'fontconfig', lib: 'libfontconfig.1.dylib' },
    { name: 'freetype', lib: 'libfreetype.6.dylib' },
    { name: 'libpng', lib: 'libpng16.16.dylib' },
    { name: 'libtiff', lib: 'libtiff.6.dylib' },
    { name: 'jpeg-turbo', lib: 'libjpeg.8.dylib' },
    { name: 'libomp', lib: 'libomp.dylib' },
    { name: 'zstd', lib: 'libzstd.1.dylib' },
    { name: 'xz', lib: 'liblzma.5.dylib' },
  ];
  
  // Detect Homebrew prefix
  let homebrewPrefix = '/opt/homebrew';
  try {
    const { stdout } = await execAsync('brew --prefix');
    homebrewPrefix = stdout.trim();
    console.log(`   Using Homebrew prefix: ${homebrewPrefix}`);
  } catch {
    console.log(`   Using default Homebrew prefix: ${homebrewPrefix}`);
  }
  
  let copiedCount = 0;
  let skippedCount = 0;
  
  for (const { name, lib } of homebrewLibs) {
    const srcPath = path.join(homebrewPrefix, 'opt', name, 'lib', lib);
    const destPath = path.join(libDir, lib);
    
    try {
      // Check if source exists
      await fs.access(srcPath);
      
      // Copy the library
      await execAsync(`cp "${srcPath}" "${destPath}"`);
      
      // Make it writable so we can modify it later
      await fs.chmod(destPath, 0o755);
      
      console.log(`   ✓ Copied: ${lib}`);
      copiedCount++;
    } catch (error) {
      console.warn(`   ⚠️  Skipped ${lib}: not found at ${srcPath}`);
      skippedCount++;
    }
  }
  
  console.log(`\n   Summary: ${copiedCount} libraries copied, ${skippedCount} skipped`);
  
  // Now update the install names to use @rpath
  console.log('\n🔧 Updating library install names...');
  
  // Get all dylib files in the lib directory
  try {
    const { stdout } = await execAsync(`find "${libDir}" -name "*.dylib" -type f`);
    const dylibFiles = stdout.trim().split('\n').filter(Boolean);
    
    for (const dylibFile of dylibFiles) {
      const dylibName = path.basename(dylibFile);
      
      // Update the install name (ID) to use @rpath
      try {
        await execAsync(`install_name_tool -id "@rpath/${dylibName}" "${dylibFile}"`);
      } catch (error) {
        // Might fail if already set, that's okay
      }
      
      // Find all dependencies and update them to use @rpath
      try {
        const { stdout: otoolOutput } = await execAsync(`otool -L "${dylibFile}"`);
        const lines = otoolOutput.split('\n').slice(1); // Skip first line (the file itself)
        
        for (const line of lines) {
          const match = line.trim().match(/^(.+?)\s+\(/);
          if (!match) continue;
          
          const depPath = match[1];
          
          // If it's a Homebrew path, update it to @rpath
          if (depPath.includes('/opt/homebrew/') || depPath.includes('/usr/local/')) {
            const depName = path.basename(depPath);
            
            // Check if this dependency exists in our lib directory
            const localDepPath = path.join(libDir, depName);
            try {
              await fs.access(localDepPath);
              // Update the reference to use @rpath
              await execAsync(`install_name_tool -change "${depPath}" "@rpath/${depName}" "${dylibFile}"`);
              console.log(`   ✓ Updated ${dylibName}: ${depName} -> @rpath`);
            } catch {
              // Dependency not bundled, skip
            }
          }
        }
      } catch (error) {
        console.warn(`   ⚠️  Could not analyze dependencies for ${dylibName}`);
      }
    }
    
    // Also update the main kolosal-server binary and libkolosal_server.dylib if they exist
    const kolosalServer = path.join(path.dirname(libDir), 'bin', 'kolosal-server');
    const libKolosalServer = path.join(libDir, 'libkolosal_server.dylib');
    const libLlamaMetal = path.join(libDir, 'libllama-metal.dylib');
    
    for (const binary of [kolosalServer, libKolosalServer, libLlamaMetal]) {
      try {
        await fs.access(binary);
        const binaryName = path.basename(binary);
        
        // Add @rpath to search in ../lib (relative to bin/)
        const isInBin = binary.includes('/bin/');
        if (isInBin) {
          try {
            await execAsync(`install_name_tool -add_rpath "@executable_path/../lib" "${binary}"`);
            console.log(`   ✓ Added @rpath to ${binaryName}`);
          } catch {
            // rpath might already exist
          }
        } else {
          // For libraries, set rpath relative to themselves
          try {
            await execAsync(`install_name_tool -add_rpath "@loader_path" "${binary}"`);
            console.log(`   ✓ Added @rpath to ${binaryName}`);
          } catch {
            // rpath might already exist
          }
        }
        
        // Update Homebrew dependencies to use @rpath
        const { stdout: otoolOutput } = await execAsync(`otool -L "${binary}"`);
        const lines = otoolOutput.split('\n').slice(1);
        
        for (const line of lines) {
          const match = line.trim().match(/^(.+?)\s+\(/);
          if (!match) continue;
          
          const depPath = match[1];
          
          if (depPath.includes('/opt/homebrew/') || depPath.includes('/usr/local/')) {
            const depName = path.basename(depPath);
            const localDepPath = path.join(libDir, depName);
            
            try {
              await fs.access(localDepPath);
              await execAsync(`install_name_tool -change "${depPath}" "@rpath/${depName}" "${binary}"`);
              console.log(`   ✓ Updated ${binaryName}: ${depName} -> @rpath`);
            } catch {
              // Dependency not bundled
            }
          }
        }
      } catch {
        // Binary doesn't exist, skip
      }
    }
    
    console.log('✅ Library install names updated');
  } catch (error) {
    console.warn(`⚠️  Error updating install names: ${error.message}`);
  }
}

async function signNativeBinaries(appDir) {
  // Check for Developer ID Application certificate (required for binaries)
  const signingIdentity = process.env.CODESIGN_IDENTITY_APP || process.env.CODESIGN_IDENTITY;
  
  if (!signingIdentity) {
    console.log('\n⚠️  No code signing identity found');
    console.log('   Native binaries will NOT be signed (notarization will fail)');
    console.log('   Set CODESIGN_IDENTITY_APP="Developer ID Application: Your Name (TEAM_ID)"');
    return;
  }
  
  // Check if it's the right type of certificate
  if (signingIdentity.includes('Installer')) {
    console.log('\n⚠️  WARNING: Using "Developer ID Installer" for binaries');
    console.log('   You need "Developer ID Application" certificate for notarization');
    console.log('   Set CODESIGN_IDENTITY_APP="Developer ID Application: Your Name (TEAM_ID)"');
    console.log('   Attempting to sign anyway...');
  }
  
  console.log('\n🔐 Signing native binaries...');
  
  // Find all binaries that need signing:
  // - .node files (native Node.js addons)
  // - .dylib files (dynamic libraries)
  // - executables (kolosal-server, spawn-helper, node)
  const { stdout } = await execAsync(
    `find "${appDir}" -type f \\( -name "*.node" -o -name "*.dylib" -o -perm +111 \\) | grep -E '\\.(node|dylib)$|/(node|kolosal-server|spawn-helper)$'`
  );
  
  const binaries = stdout.trim().split('\n').filter(Boolean);
  
  if (binaries.length === 0) {
    console.log('   No native binaries found to sign');
    return;
  }
  
  console.log(`   Found ${binaries.length} binaries to sign`);
  
  // Entitlements file path
  const entitlementsPath = path.join(rootDir, 'scripts', 'entitlements.plist');
  
  // Helper function to sign with retry logic for timestamp server issues
  async function signBinary(binary, maxRetries = 3) {
    // Determine if this binary needs entitlements
    const needsEntitlements = binary.includes('/node') || binary.includes('kolosal-server');
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Sign with hardened runtime and timestamp
        let signCmd = `codesign --sign "${signingIdentity}" ` +
          `--force ` +
          `--timestamp ` +
          `--options runtime `;
        
        // Add entitlements for binaries that need them
        if (needsEntitlements) {
          signCmd += `--entitlements "${entitlementsPath}" `;
        }
        
        signCmd += `"${binary}"`;
        
        await execAsync(signCmd);
        return true;
      } catch (error) {
        const isTimestampError = error.message.includes('timestamp service is not available');
        
        if (isTimestampError && attempt < maxRetries) {
          console.log(`   ⏳ Timestamp server unavailable, retrying in ${attempt}s... (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        } else {
          throw error;
        }
      }
    }
  }
  
  for (const binary of binaries) {
    try {
      await signBinary(binary);
      console.log(`   ✓ Signed: ${path.relative(appDir, binary)}`);
    } catch (error) {
      console.error(`   ✗ Failed to sign ${binary}: ${error.message}`);
      throw error;
    }
  }
  
  console.log('✅ All native binaries signed');
}

async function createPkg(appDir) {
  console.log('\n📦 Creating .pkg installer...');
  
  const distDir = path.join(rootDir, 'dist', 'mac');
  const pkgRoot = path.join(rootDir, '.pkgroot');
  const targetDir = path.join(pkgRoot, 'usr', 'local');
  
  // Clean and prepare pkg root
  await fs.rm(pkgRoot, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  
  // Copy the app to the pkg root
  await execAsync(`cp -R "${appDir}" "${targetDir}/kolosal-app"`);
  
  // Create a symlink in /usr/local/bin
  const binLink = path.join(pkgRoot, 'usr', 'local', 'bin');
  await fs.mkdir(binLink, { recursive: true });
  await fs.symlink('../kolosal-app/bin/kolosal', path.join(binLink, 'kolosal'));
  
  // Build the package
  const pkgOutput = path.join(distDir, 'KolosalCode-macos.pkg');
  await execAsync(
    `pkgbuild --identifier ai.kolosal.kolosal-code ` +
    `--install-location / ` +
    `--version ${pkg.version} ` +
    `--root "${pkgRoot}" ` +
    `"${pkgOutput}"`
  );
  
  console.log(`✅ Package created: ${pkgOutput}`);
  
  // Verify package contents
  console.log('\n📋 Package contents:');
  const { stdout } = await execAsync(`pkgutil --payload-files "${pkgOutput}"`);
  console.log(stdout);
  
  return pkgOutput;
}

async function signPkg(pkgPath) {
  const signingIdentity = process.env.CODESIGN_IDENTITY;
  
  if (!signingIdentity) {
    console.log('\n⚠️  No CODESIGN_IDENTITY found, skipping signing');
    console.log('   Set CODESIGN_IDENTITY="Developer ID Installer: Your Name (TEAM_ID)"');
    console.log('   See docs/CODE-SIGNING.md for details');
    return pkgPath;
  }
  
  console.log('\n🔐 Signing package...');
  const signedPkgPath = pkgPath.replace('.pkg', '-signed.pkg');
  
  try {
    await execAsync(
      `productsign --sign "${signingIdentity}" ` +
      `"${pkgPath}" "${signedPkgPath}"`
    );
    
    console.log('✅ Package signed successfully');
    
    // Verify signature
    const { stdout } = await execAsync(
      `pkgutil --check-signature "${signedPkgPath}"`
    );
    console.log('\n📋 Signature verification:');
    console.log(stdout);
    
    // Remove unsigned package
    await fs.unlink(pkgPath);
    
    return signedPkgPath;
  } catch (error) {
    console.error(`❌ Signing failed: ${error.message}`);
    console.error('   Make sure you have a valid "Developer ID Installer" certificate');
    console.error('   Run: security find-identity -v -p basic');
    throw error;
  }
}

async function notarizePkg(pkgPath) {
  const profile = process.env.NOTARIZE_PROFILE || 'notarytool-profile';
  
  if (!process.env.NOTARIZE || process.env.NOTARIZE !== '1') {
    console.log('\n⚠️  Skipping notarization (set NOTARIZE=1 to enable)');
    console.log('   See docs/CODE-SIGNING.md for notarization setup');
    return pkgPath;
  }
  
  console.log('\n🔔 Submitting for notarization...');
  console.log('   This may take 1-5 minutes...');
  
  try {
    // Submit for notarization
    const { stdout: submitOutput } = await execAsync(
      `xcrun notarytool submit "${pkgPath}" ` +
      `--keychain-profile "${profile}" --wait`,
      { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer for output
    );
    console.log(submitOutput);
    
    // Staple the notarization ticket
    console.log('\n📎 Stapling notarization ticket...');
    await execAsync(`xcrun stapler staple "${pkgPath}"`);
    
    // Verify
    const { stdout: verifyOutput } = await execAsync(
      `xcrun stapler validate "${pkgPath}"`
    );
    console.log('✅ Notarization complete!');
    console.log(verifyOutput);
    
    return pkgPath;
  } catch (error) {
    console.error(`❌ Notarization failed: ${error.message}`);
    console.error('   Check notarization logs with:');
    console.error(`   xcrun notarytool log <submission-id> --keychain-profile "${profile}"`);
    throw error;
  }
}

async function main() {
  try {
    const appDir = await buildStandalone();
    let pkgPath = await createPkg(appDir);
    
    // Sign the package (if CODESIGN_IDENTITY is set)
    pkgPath = await signPkg(pkgPath);
    
    // Notarize the package (if NOTARIZE=1 is set)
    pkgPath = await notarizePkg(pkgPath);
    
    console.log('\n✨ Build complete!');
    console.log(`\n📦 Package: ${pkgPath}`);
    console.log('\n📝 To install:');
    console.log(`   sudo installer -pkg "${pkgPath}" -target /`);
    console.log('\n🚀 After installation, run:');
    console.log('   kolosal --version');
  } catch (error) {
    console.error(`\n❌ Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
