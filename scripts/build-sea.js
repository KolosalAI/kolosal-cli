#!/usr/bin/env node

/**
 * Build script for creating macOS Single Executable Applications (SEA)
 * using Node.js native SEA support (Node 20+)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildSEA(arch) {
  console.log(`\n🔨 Building SEA for ${arch}...`);
  
  const distDir = path.join(rootDir, 'dist', 'mac');
  const outputBinary = path.join(distDir, `kolosal-${arch}`);
  const seaConfig = path.join(distDir, `sea-config-${arch}.json`);
  const seaBlob = path.join(distDir, `sea-prep-${arch}.blob`);
  
  // Ensure dist directory exists
  await fs.mkdir(distDir, { recursive: true });
  
  // Step 1: Create SEA configuration
  const config = {
    main: path.join(rootDir, 'bundle', 'gemini.js'),
    output: seaBlob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true
  };
  
  console.log(`📝 Creating SEA config for ${arch}...`);
  await fs.writeFile(seaConfig, JSON.stringify(config, null, 2));
  
  // Step 2: Generate the blob
  console.log(`🔧 Generating blob for ${arch}...`);
  try {
    await execAsync(`node --experimental-sea-config "${seaConfig}"`, {
      cwd: rootDir
    });
  } catch (error) {
    console.error(`Error generating blob: ${error.message}`);
    throw error;
  }
  
  // Step 3: Copy Node binary
  console.log(`📦 Copying Node binary for ${arch}...`);
  const nodeExecutable = process.execPath;
  await fs.copyFile(nodeExecutable, outputBinary);
  await fs.chmod(outputBinary, 0o755);
  
  // Step 4: Check if postject is available
  let postjectCmd;
  try {
    await execAsync('which postject');
    postjectCmd = 'postject';
  } catch {
    // Try npx
    postjectCmd = 'npx postject';
  }
  
  // Step 5: Inject the blob using postject
  console.log(`💉 Injecting blob into binary for ${arch}...`);
  const platform = process.platform === 'darwin' ? 'macho' : 'pe';
  
  try {
    // For macOS, we need to remove signature first if it exists
    if (process.platform === 'darwin') {
      try {
        await execAsync(`codesign --remove-signature "${outputBinary}"`);
      } catch {
        // Ignore if no signature exists
      }
    }
    
    await execAsync(
      `${postjectCmd} "${outputBinary}" NODE_SEA_BLOB "${seaBlob}" ` +
      `--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ` +
      `--${platform}-segment-name NODE_SEA`
    );
  } catch (error) {
    console.error(`Error injecting blob: ${error.message}`);
    throw error;
  }
  
  // Step 6: Sign the binary (macOS only)
  if (process.platform === 'darwin') {
    console.log(`✍️  Ad-hoc signing binary for ${arch}...`);
    try {
      await execAsync(`codesign --sign - "${outputBinary}"`);
    } catch (error) {
      console.warn(`Warning: Could not sign binary: ${error.message}`);
    }
  }
  
  // Clean up intermediate files
  await fs.unlink(seaConfig).catch(() => {});
  await fs.unlink(seaBlob).catch(() => {});
  
  console.log(`✅ SEA binary created: ${outputBinary}`);
  
  return outputBinary;
}

async function main() {
  const arch = process.argv[2] || 'arm64';
  
  if (!['arm64', 'x64'].includes(arch)) {
    console.error('Usage: node build-sea.js [arm64|x64]');
    process.exit(1);
  }
  
  try {
    // Check if postject is available
    try {
      await execAsync('which postject');
      console.log('✅ postject found');
    } catch {
      console.log('📦 Installing postject...');
      await execAsync('npm install -g postject');
    }
    
    const binary = await buildSEA(arch);
    
    // Test the binary
    console.log(`\n🧪 Testing binary...`);
    const { stdout } = await execAsync(`"${binary}" --version`);
    console.log(`Version: ${stdout.trim()}`);
    
    console.log(`\n✨ Build complete!`);
  } catch (error) {
    console.error(`\n❌ Build failed: ${error.message}`);
    process.exit(1);
  }
}

main();
