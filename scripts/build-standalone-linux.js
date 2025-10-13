#!/usr/bin/env node

/**
 * Build script for creating a standalone Linux package
 * This bundles Node.js + the application into a single directory,
 * then packages it as .deb, .rpm, or AppImage
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
  const arch = process.arch; // 'x64', 'arm64', etc.
  const platform = process.platform; // 'linux'
  
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
  console.log('🔨 Building standalone Linux package (with embedded Node.js)...\n');
  
  const distDir = path.join(rootDir, 'dist', 'linux');
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
    await execAsync('node scripts/build_kolosal_server.js', { cwd: rootDir });
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
    '@lydell/node-pty-linux-x64',
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

# Set LD_LIBRARY_PATH to include our bundled libraries (for kolosal-server)
export LD_LIBRARY_PATH="$APP_DIR/lib:\${LD_LIBRARY_PATH}"

# Execute the bundle with the bundled Node.js
exec "$NODE_BINARY" "$APP_DIR/lib/bundle/gemini.js" "$@"
`;
  
  const launcherPath = path.join(binDir, 'kolosal');
  await fs.writeFile(launcherPath, launcher);
  await fs.chmod(launcherPath, 0o755);
  
  console.log('✅ Standalone app created at:', appDir);
  
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

async function createDeb(appDir) {
  console.log('\n📦 Creating .deb package...');
  
  const distDir = path.join(rootDir, 'dist', 'linux');
  const debRoot = path.join(rootDir, '.debroot');
  const debianDir = path.join(debRoot, 'DEBIAN');
  const targetDir = path.join(debRoot, 'opt');
  const binDir = path.join(debRoot, 'usr', 'local', 'bin');
  
  // Clean and prepare deb root
  await fs.rm(debRoot, { recursive: true, force: true });
  await fs.mkdir(debianDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  
  // Copy the app to the deb root
  await execAsync(`cp -R "${appDir}" "${targetDir}/kolosal-app"`);
  
  // Create a symlink in /usr/local/bin
  await fs.symlink('/opt/kolosal-app/bin/kolosal', path.join(binDir, 'kolosal'));
  
  // Load package dependencies if available
  let dependencies = 'libc6';
  try {
    const depsFile = path.join(distDir, 'package-dependencies.json');
    const depsData = await fs.readFile(depsFile, 'utf-8');
    const deps = JSON.parse(depsData);
    if (deps.packages && deps.packages.length > 0) {
      dependencies = deps.packages.join(', ');
      console.log(`   Using ${deps.packages.length} package dependencies from analysis`);
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not load package dependencies, using defaults`);
  }
  
  // Create control file
  const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch;
  const controlContent = `Package: kolosal-code
Version: ${pkg.version}
Section: devel
Priority: optional
Architecture: ${arch}
Depends: ${dependencies}
Maintainer: Kolosal AI <support@kolosal.ai>
Description: AI-powered coding assistant
 Kolosal Code is an intelligent coding companion that helps developers
 write, understand, and improve code using advanced AI technology.
 .
 This package includes a bundled Node.js runtime and kolosal-server.
Homepage: https://github.com/KolosalAI/kolosal-code
`;
  
  await fs.writeFile(path.join(debianDir, 'control'), controlContent);
  
  // Create postinst script (optional, for setting up alternatives, etc.)
  const postinstContent = `#!/bin/bash
set -e

# Update alternatives (optional)
# update-alternatives --install /usr/bin/kolosal kolosal /opt/kolosal-app/bin/kolosal 100

echo "Kolosal Code has been installed to /opt/kolosal-app"
echo "The 'kolosal' command is available at /usr/local/bin/kolosal"
`;
  
  await fs.writeFile(path.join(debianDir, 'postinst'), postinstContent);
  await fs.chmod(path.join(debianDir, 'postinst'), 0o755);
  
  // Create prerm script (optional, for cleanup)
  const prermContent = `#!/bin/bash
set -e

# Remove alternatives (optional)
# update-alternatives --remove kolosal /opt/kolosal-app/bin/kolosal

exit 0
`;
  
  await fs.writeFile(path.join(debianDir, 'prerm'), prermContent);
  await fs.chmod(path.join(debianDir, 'prerm'), 0o755);
  
  // Build the package
  const debOutput = path.join(distDir, `kolosal-code_${pkg.version}_${arch}.deb`);
  await execAsync(`dpkg-deb --build "${debRoot}" "${debOutput}"`);
  
  console.log(`✅ Package created: ${debOutput}`);
  
  // Verify package contents
  console.log('\n📋 Package info:');
  try {
    const { stdout } = await execAsync(`dpkg-deb --info "${debOutput}"`);
    console.log(stdout);
  } catch (error) {
    console.warn('⚠️  Could not read package info (dpkg-deb might not be installed)');
  }
  
  return debOutput;
}

async function createRpm(appDir) {
  console.log('\n📦 Creating .rpm package...');
  
  // Check if rpmbuild is available
  try {
    await execAsync('which rpmbuild');
  } catch {
    console.log('⚠️  rpmbuild not found, skipping RPM creation');
    console.log('   Install rpm-build: sudo apt-get install rpm');
    return null;
  }
  
  const distDir = path.join(rootDir, 'dist', 'linux');
  const rpmRoot = path.join(rootDir, '.rpmroot');
  const buildRoot = path.join(rpmRoot, 'BUILD');
  const rpmsDir = path.join(rpmRoot, 'RPMS');
  const specsDir = path.join(rpmRoot, 'SPECS');
  const sourcesDir = path.join(rpmRoot, 'SOURCES');
  
  // Clean and create RPM build directories
  await fs.rm(rpmRoot, { recursive: true, force: true });
  await fs.mkdir(buildRoot, { recursive: true });
  await fs.mkdir(rpmsDir, { recursive: true });
  await fs.mkdir(specsDir, { recursive: true });
  await fs.mkdir(sourcesDir, { recursive: true });
  
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
  
  // Load package dependencies if available
  let rpmRequires = '';
  try {
    const depsFile = path.join(distDir, 'package-dependencies.json');
    const depsData = await fs.readFile(depsFile, 'utf-8');
    const deps = JSON.parse(depsData);
    if (deps.packages && deps.packages.length > 0) {
      // Convert Debian package names to RPM equivalents
      const rpmPackageMap = {
        'libblas3': 'blas',
        'libcurl4': 'libcurl',
        'libfontconfig1': 'fontconfig',
        'libfreetype6': 'freetype',
        'libgomp1': 'libgomp',
        'libjpeg8': 'libjpeg-turbo',
        'liblapack3': 'lapack',
        'libpng16-16': 'libpng',
        'libssl3': 'openssl-libs',
        'libtiff6': 'libtiff',
        'libxml2': 'libxml2',
        'zlib1g': 'zlib',
      };
      const rpmPackages = deps.packages.map(pkg => rpmPackageMap[pkg] || pkg);
      rpmRequires = rpmPackages.map(pkg => `Requires: ${pkg}`).join('\n');
      console.log(`   Using ${rpmPackages.length} package dependencies for RPM`);
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not load package dependencies for RPM`);
  }
  
  // Create spec file
  const specContent = `Name: kolosal-code
Version: ${pkg.version}
Release: 1
Summary: AI-powered coding assistant
License: Proprietary
URL: https://github.com/KolosalAI/kolosal-code
BuildArch: ${arch}
${rpmRequires}

%description
Kolosal Code is an intelligent coding companion that helps developers
write, understand, and improve code using advanced AI technology.

This package includes a bundled Node.js runtime and kolosal-server.

%install
mkdir -p %{buildroot}/opt
mkdir -p %{buildroot}/usr/local/bin
cp -R ${appDir} %{buildroot}/opt/kolosal-app
ln -s /opt/kolosal-app/bin/kolosal %{buildroot}/usr/local/bin/kolosal

%files
/opt/kolosal-app
/usr/local/bin/kolosal

%post
echo "Kolosal Code has been installed to /opt/kolosal-app"
echo "The 'kolosal' command is available at /usr/local/bin/kolosal"

%postun
rm -rf /opt/kolosal-app

%changelog
* $(date '+%a %b %d %Y') Kolosal AI <support@kolosal.ai> - ${pkg.version}-1
- Release ${pkg.version}
`;
  
  const specPath = path.join(specsDir, 'kolosal-code.spec');
  await fs.writeFile(specPath, specContent);
  
  // Build the RPM
  const rpmOutput = path.join(rpmsDir, arch, `kolosal-code-${pkg.version}-1.${arch}.rpm`);
  
  try {
    await execAsync(
      `rpmbuild -bb "${specPath}" ` +
      `--define "_topdir ${rpmRoot}" ` +
      `--define "_rpmdir ${rpmsDir}"`
    );
    
    // Move RPM to dist directory
    const finalRpmPath = path.join(distDir, `kolosal-code-${pkg.version}-1.${arch}.rpm`);
    await execAsync(`mv "${rpmOutput}" "${finalRpmPath}"`);
    
    console.log(`✅ Package created: ${finalRpmPath}`);
    
    // Verify package
    console.log('\n📋 Package info:');
    const { stdout } = await execAsync(`rpm -qip "${finalRpmPath}"`);
    console.log(stdout);
    
    return finalRpmPath;
  } catch (error) {
    console.error(`❌ RPM build failed: ${error.message}`);
    return null;
  }
}

async function createTarball(appDir) {
  console.log('\n📦 Creating .tar.gz archive...');
  
  const distDir = path.join(rootDir, 'dist', 'linux');
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  const tarballPath = path.join(distDir, `kolosal-code-${pkg.version}-linux-${arch}.tar.gz`);
  
  // Create tarball
  await execAsync(
    `tar -czf "${tarballPath}" -C "${path.dirname(appDir)}" "${path.basename(appDir)}"`
  );
  
  console.log(`✅ Tarball created: ${tarballPath}`);
  console.log('\n📝 To install from tarball:');
  console.log(`   sudo tar -xzf ${path.basename(tarballPath)} -C /opt`);
  console.log('   sudo ln -s /opt/kolosal-app/bin/kolosal /usr/local/bin/kolosal');
  
  return tarballPath;
}

async function main() {
  try {
    const format = process.argv[2] || 'all';
    
    console.log(`Building Linux package(s): ${format}\n`);
    
    const appDir = await buildStandalone();
    
    const outputs = [];
    
    if (format === 'all' || format === 'deb') {
      try {
        const debPath = await createDeb(appDir);
        outputs.push({ type: 'deb', path: debPath });
      } catch (error) {
        console.error(`❌ DEB creation failed: ${error.message}`);
      }
    }
    
    if (format === 'all' || format === 'rpm') {
      try {
        const rpmPath = await createRpm(appDir);
        if (rpmPath) {
          outputs.push({ type: 'rpm', path: rpmPath });
        }
      } catch (error) {
        console.error(`❌ RPM creation failed: ${error.message}`);
      }
    }
    
    if (format === 'all' || format === 'tar' || format === 'tarball') {
      try {
        const tarPath = await createTarball(appDir);
        outputs.push({ type: 'tar.gz', path: tarPath });
      } catch (error) {
        console.error(`❌ Tarball creation failed: ${error.message}`);
      }
    }
    
    console.log('\n✨ Build complete!');
    console.log('\n📦 Packages created:');
    outputs.forEach(({ type, path }) => {
      console.log(`   [${type}] ${path}`);
    });
    
    console.log('\n📝 Installation instructions:');
    outputs.forEach(({ type, path }) => {
      if (type === 'deb') {
        console.log(`\n   DEB package:`);
        console.log(`   sudo dpkg -i "${path}"`);
        console.log(`   # or`);
        console.log(`   sudo apt install "${path}"`);
      } else if (type === 'rpm') {
        console.log(`\n   RPM package:`);
        console.log(`   sudo rpm -i "${path}"`);
        console.log(`   # or`);
        console.log(`   sudo dnf install "${path}"`);
      } else if (type === 'tar.gz') {
        console.log(`\n   Tarball:`);
        console.log(`   sudo tar -xzf "${path}" -C /opt`);
        console.log(`   sudo ln -s /opt/kolosal-app/bin/kolosal /usr/local/bin/kolosal`);
      }
    });
    
    console.log('\n🚀 After installation, run:');
    console.log('   kolosal --version');
    
  } catch (error) {
    console.error(`\n❌ Build failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
