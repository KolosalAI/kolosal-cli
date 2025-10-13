#!/usr/bin/env node

/**
 * Bundle shared libraries script
 * This script analyzes the dependencies of kolosal-server and bundles necessary libraries
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// System libraries that should NOT be bundled (these are expected to be on every Linux system)
const SYSTEM_LIBS = new Set([
  'linux-vdso.so.1',
  'ld-linux-x86-64.so.2',
  'libc.so.6',
  'libm.so.6',
  'libdl.so.2',
  'libpthread.so.0',
  'librt.so.1',
  'libgcc_s.so.1',
  'libstdc++.so.6',
]);

// Libraries that are common on most Linux distributions and probably shouldn't be bundled
// These can be adjusted based on your distribution requirements
const COMMON_SYSTEM_LIBS = new Set([
  'libz.so.1',
  'libssl.so.3',
  'libcrypto.so.3',
  'libc.so.6',
  'libm.so.6',
  'libpthread.so.0',
  'libdl.so.2',
  'librt.so.1',
]);

// Custom libraries built with kolosal-server that MUST be bundled
const CUSTOM_LIBS = new Set([
  'libkolosal_server.so',
  'libllama-cpu.so',
]);

/**
 * Get all dependencies of a binary or library
 */
async function getDependencies(binaryPath) {
  try {
    const { stdout } = await execAsync(`ldd "${binaryPath}"`);
    const deps = [];
    
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^(\S+)\s*=>\s*(\S+)/);
      if (match) {
        const [, libName, libPath] = match;
        deps.push({ name: libName, path: libPath });
      }
    }
    
    return deps;
  } catch (error) {
    console.error(`Error getting dependencies for ${binaryPath}: ${error.message}`);
    return [];
  }
}

/**
 * Determine if a library should be bundled
 */
function shouldBundleLibrary(libName) {
  // Always bundle custom libraries
  if (CUSTOM_LIBS.has(libName)) {
    return true;
  }
  
  // Never bundle core system libraries
  if (SYSTEM_LIBS.has(libName)) {
    return false;
  }
  
  // Don't bundle common system libraries
  if (COMMON_SYSTEM_LIBS.has(libName)) {
    return false;
  }
  
  // Bundle everything else (application-specific dependencies)
  return false; // Conservative: don't bundle by default
}

/**
 * Get recursive dependencies
 */
async function getRecursiveDependencies(binaryPath, visited = new Set(), depth = 0) {
  if (depth > 10) {
    console.warn(`Max recursion depth reached for ${binaryPath}`);
    return [];
  }
  
  const deps = await getDependencies(binaryPath);
  const allDeps = [];
  
  for (const dep of deps) {
    if (visited.has(dep.name)) {
      continue;
    }
    
    visited.add(dep.name);
    allDeps.push(dep);
    
    // Recursively get dependencies of this library
    if (dep.path && dep.path !== 'not found') {
      const subDeps = await getRecursiveDependencies(dep.path, visited, depth + 1);
      allDeps.push(...subDeps);
    }
  }
  
  return allDeps;
}

/**
 * Main bundling function
 */
async function bundleLibraries(distDir) {
  console.log('📚 Analyzing shared library dependencies...\n');
  
  const binDir = path.join(distDir, 'bin');
  const libDir = path.join(distDir, 'lib');
  
  // Files to analyze
  const binariesToAnalyze = [
    path.join(binDir, 'kolosal-server'),
  ];
  
  const librariesToAnalyze = [
    path.join(libDir, 'libkolosal_server.so'),
    path.join(libDir, 'libllama-cpu.so'),
  ];
  
  // Collect all dependencies
  const allDeps = new Set();
  
  console.log('🔍 Analyzing binaries...');
  for (const binary of binariesToAnalyze) {
    try {
      await fs.access(binary);
      console.log(`   ${path.basename(binary)}`);
      const deps = await getRecursiveDependencies(binary);
      deps.forEach(dep => allDeps.add(JSON.stringify(dep)));
    } catch (error) {
      console.warn(`   ⚠️  Could not analyze ${binary}: ${error.message}`);
    }
  }
  
  console.log('\n🔍 Analyzing libraries...');
  for (const library of librariesToAnalyze) {
    try {
      await fs.access(library);
      console.log(`   ${path.basename(library)}`);
      const deps = await getRecursiveDependencies(library);
      deps.forEach(dep => allDeps.add(JSON.stringify(dep)));
    } catch (error) {
      console.warn(`   ⚠️  Could not analyze ${library}: ${error.message}`);
    }
  }
  
  // Parse dependencies
  const dependencies = Array.from(allDeps).map(dep => JSON.parse(dep));
  
  console.log(`\n📋 Found ${dependencies.length} total dependencies`);
  
  // Categorize dependencies
  const toBundleCustom = dependencies.filter(dep => CUSTOM_LIBS.has(dep.name));
  const toBundleOther = dependencies.filter(dep => !CUSTOM_LIBS.has(dep.name) && shouldBundleLibrary(dep.name));
  const systemLibs = dependencies.filter(dep => !shouldBundleLibrary(dep.name) && !CUSTOM_LIBS.has(dep.name));
  
  console.log(`\n📊 Dependency Analysis:`);
  console.log(`   Custom libraries: ${toBundleCustom.length} (already bundled)`);
  console.log(`   Additional libraries to bundle: ${toBundleOther.length}`);
  console.log(`   System libraries: ${systemLibs.length}`);
  
  if (toBundleCustom.length > 0) {
    console.log(`\n✅ Custom libraries (already bundled):`);
    toBundleCustom.forEach(dep => {
      console.log(`   ✓ ${dep.name}`);
    });
  }
  
  if (toBundleOther.length > 0) {
    console.log(`\n📦 Additional libraries that could be bundled:`);
    toBundleOther.forEach(dep => {
      console.log(`   • ${dep.name} => ${dep.path}`);
    });
    
    // Copy additional libraries if requested
    // This is disabled by default for safety
    console.log(`\n⚠️  Note: Additional library bundling is disabled by default.`);
    console.log(`   If you need to bundle more libraries, enable it in this script.`);
  }
  
  console.log(`\n📋 System dependencies (not bundled):`);
  const uniqueSystemLibs = new Map();
  systemLibs.forEach(dep => {
    if (!uniqueSystemLibs.has(dep.name)) {
      uniqueSystemLibs.set(dep.name, dep.path);
    }
  });
  
  Array.from(uniqueSystemLibs.keys()).sort().forEach(name => {
    console.log(`   • ${name}`);
  });
  
  console.log(`\n✅ Library bundling analysis complete!`);
  
  return {
    custom: toBundleCustom,
    additional: toBundleOther,
    system: Array.from(uniqueSystemLibs.keys()),
  };
}

/**
 * Generate package dependencies for .deb and .rpm
 */
function generatePackageDependencies(systemLibs) {
  console.log(`\n📝 Generating package dependency list...`);
  
  // Map library names to package names
  const libToPackage = {
    'libcurl.so.4': 'libcurl4',
    'libssl.so.3': 'libssl3',
    'libcrypto.so.3': 'libssl3',
    'libfontconfig.so.1': 'libfontconfig1',
    'libfreetype.so.6': 'libfreetype6',
    'libxml2.so.2': 'libxml2',
    'libpng16.so.16': 'libpng16-16',
    'libz.so.1': 'zlib1g',
    'libtiff.so.6': 'libtiff6',
    'libjpeg.so.8': 'libjpeg8',
    'libblas.so.3': 'libblas3',
    'liblapack.so.3': 'liblapack3',
    'libgomp.so.1': 'libgomp1',
  };
  
  const packages = new Set();
  systemLibs.forEach(lib => {
    if (libToPackage[lib]) {
      packages.add(libToPackage[lib]);
    }
  });
  
  const packageList = Array.from(packages).sort();
  
  console.log(`\n   Debian packages required:`);
  packageList.forEach(pkg => console.log(`   - ${pkg}`));
  
  return packageList;
}

async function main() {
  const platformDir = process.platform === 'darwin' ? 'mac' : 'linux';
  const distDir = path.join(rootDir, 'dist', platformDir, 'kolosal-app');
  
  console.log('🚀 Starting shared library bundling analysis...\n');
  console.log(`   Platform: ${platformDir}`);
  console.log(`   Distribution: ${distDir}\n`);
  
  const result = await bundleLibraries(distDir);
  
  if (process.platform === 'linux') {
    const packageDeps = generatePackageDependencies(result.system);
    
    // Save to file for package creation
    const depsFile = path.join(rootDir, 'dist', platformDir, 'package-dependencies.json');
    await fs.writeFile(depsFile, JSON.stringify({
      system: result.system,
      packages: packageDeps,
      custom: result.custom.map(d => d.name),
    }, null, 2));
    
    console.log(`\n💾 Saved dependency information to: ${depsFile}`);
  }
  
  console.log(`\n🎉 Analysis complete!`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { bundleLibraries, getDependencies, shouldBundleLibrary };
