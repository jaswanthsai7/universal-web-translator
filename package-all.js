import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, 'dist');
const scratchDir = path.resolve(__dirname, '..');
const desktopDir = 'C:\\Users\\jasva\\OneDrive\\Desktop';
const downloadsDir = 'C:\\Users\\jasva\\Downloads';

// Target Zip Paths
const targets = [
  path.join(__dirname, 'bilibili-english-translator.zip'),
  path.join(scratchDir, 'universal-web-translator.zip'),
  path.join(desktopDir, 'bilibili-english-translator.zip'),
  path.join(downloadsDir, 'bilibili-english-translator.zip')
];

console.log('📦 Generating 100% store-compliant ZIP from dist/ ...');
const primaryZip = targets[0];
if (fs.existsSync(primaryZip)) fs.unlinkSync(primaryZip);

// Compress contents of dist/* directly into primaryZip
execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${primaryZip}' -Force"`, { stdio: 'inherit' });

// Copy to all other destinations
for (let i = 1; i < targets.length; i++) {
  const dest = targets[i];
  try {
    fs.copyFileSync(primaryZip, dest);
    console.log(`✅ Copied store-ready zip to: ${dest}`);
  } catch (err) {
    console.warn(`⚠️ Could not copy to ${dest}: ${err.message}`);
  }
}

console.log('🎉 Done! All ZIPs are updated with exactly ONE manifest.json at the archive root.');
