import { build } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateAllIcons } from './generate-icons.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, 'dist');

async function buildExtension() {
  console.log('🚀 Starting Universal Webpage Translator Extension Build...');

  // Ensure clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 1. Build Background Service Worker (ES module)
  console.log('📦 Building Background Service Worker...');
  await build({
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(__dirname, 'src/background/index.ts'),
        name: 'BackgroundService',
        formats: ['es'],
        fileName: () => 'background.js',
      },
      minify: false,
    },
  });

  // 2. Build Content Script (IIFE format so it runs safely in page context)
  console.log('📦 Building Content Script...');
  await build({
    configFile: false,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/content/index.ts'),
        output: {
          format: 'iife',
          entryFileNames: 'content.js',
          name: 'UniversalWebTranslatorContent',
        },
      },
      minify: false,
    },
  });

  // 3. Build Popup UI
  console.log('📦 Building Popup UI...');
  await build({
    configFile: false,
    root: path.resolve(__dirname, 'src/popup'),
    base: './',
    build: {
      outDir: path.resolve(distDir, 'popup-temp'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/popup/index.html'),
      },
      minify: false,
    },
  });

  // Move popup files directly into dist root as popup.html
  const popupTemp = path.resolve(distDir, 'popup-temp');
  if (fs.existsSync(popupTemp)) {
    // Copy index.html as popup.html
    let popupHtml = fs.readFileSync(path.resolve(popupTemp, 'index.html'), 'utf8');
    fs.writeFileSync(path.resolve(distDir, 'popup.html'), popupHtml);

    // Copy any assets generated
    const popupAssets = path.resolve(popupTemp, 'assets');
    if (fs.existsSync(popupAssets)) {
      const distAssets = path.resolve(distDir, 'assets');
      if (!fs.existsSync(distAssets)) fs.mkdirSync(distAssets, { recursive: true });
      for (const file of fs.readdirSync(popupAssets)) {
        fs.copyFileSync(path.join(popupAssets, file), path.join(distAssets, file));
      }
    }
    fs.rmSync(popupTemp, { recursive: true, force: true });
  }

  // 4. Build Options UI
  console.log('📦 Building Options UI...');
  await build({
    configFile: false,
    root: path.resolve(__dirname, 'src/options'),
    base: './',
    build: {
      outDir: path.resolve(distDir, 'options-temp'),
      emptyOutDir: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/options/index.html'),
      },
      minify: false,
    },
  });

  // Move options files directly into dist root as options.html
  const optionsTemp = path.resolve(distDir, 'options-temp');
  if (fs.existsSync(optionsTemp)) {
    let optionsHtml = fs.readFileSync(path.resolve(optionsTemp, 'index.html'), 'utf8');
    fs.writeFileSync(path.resolve(distDir, 'options.html'), optionsHtml);

    const optionsAssets = path.resolve(optionsTemp, 'assets');
    if (fs.existsSync(optionsAssets)) {
      const distAssets = path.resolve(distDir, 'assets');
      if (!fs.existsSync(distAssets)) fs.mkdirSync(distAssets, { recursive: true });
      for (const file of fs.readdirSync(optionsAssets)) {
        fs.copyFileSync(path.join(optionsAssets, file), path.join(distAssets, file));
      }
    }
    fs.rmSync(optionsTemp, { recursive: true, force: true });
  }

  // 5. Copy Manifest & Generate Icons in dist
  console.log('📋 Copying Manifest and Generating Icons...');
  fs.copyFileSync(
    path.resolve(__dirname, 'manifest.json'),
    path.resolve(distDir, 'manifest.json')
  );

  generateAllIcons(path.resolve(distDir, 'icons'));

  // 6. Also sync built files to root directory so loading root or dist/ works seamlessly
  console.log('🔄 Syncing built extension files to root directory for direct loading...');
  fs.copyFileSync(path.resolve(distDir, 'background.js'), path.resolve(__dirname, 'background.js'));
  fs.copyFileSync(path.resolve(distDir, 'content.js'), path.resolve(__dirname, 'content.js'));
  fs.copyFileSync(path.resolve(distDir, 'popup.html'), path.resolve(__dirname, 'popup.html'));
  fs.copyFileSync(path.resolve(distDir, 'options.html'), path.resolve(__dirname, 'options.html'));

  const distAssets = path.resolve(distDir, 'assets');
  if (fs.existsSync(distAssets)) {
    const rootAssets = path.resolve(__dirname, 'assets');
    if (!fs.existsSync(rootAssets)) fs.mkdirSync(rootAssets, { recursive: true });
    for (const file of fs.readdirSync(distAssets)) {
      fs.copyFileSync(path.join(distAssets, file), path.join(rootAssets, file));
    }
  }

  console.log('✅ Extension build complete! Ready at both root and dist/');
}

buildExtension().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
