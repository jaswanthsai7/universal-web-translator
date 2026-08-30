import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(size, r = 59, g = 130, b = 246) {
  // Simple PNG encoder
  const width = size;
  const height = size;

  // Raw image data: height lines, each line has 1 filter byte (0) + width * 4 (RGBA)
  const lineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * lineSize);

  const radius = size / 2;
  const center = size / 2;

  for (let y = 0; y < height; y++) {
    const lineOffset = y * lineSize;
    rawData[lineOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pxOffset = lineOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius - 1) {
        // Draw blue globe sphere with subtle gradient
        const factor = 1 - (dist / radius) * 0.4;
        rawData[pxOffset] = Math.min(255, Math.floor(r * factor));
        rawData[pxOffset + 1] = Math.min(255, Math.floor(g * factor));
        rawData[pxOffset + 2] = Math.min(255, Math.floor(b * factor));
        rawData[pxOffset + 3] = 255;
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Helper to make chunk
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

    // CRC32 calculation
    const toCrc = Buffer.concat([typeBuf, data]);
    let crc = 0xffffffff;
    for (let i = 0; i < toCrc.length; i++) {
      crc ^= toCrc[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    crcBuf.writeUInt32BE(crc, 0);

    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // Header: 89 50 4E 47 0D 0A 1A 0A
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // Color type 6: RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT
  const idat = makeChunk('IDAT', compressed);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

export function generateAllIcons(outDir) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const sizes = [16, 48, 128];
  for (const size of sizes) {
    const png = createPNG(size);
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
    console.log(`Generated icon: icon${size}.png in ${outDir}`);
  }
}

// Run directly if invoked
if (process.argv[1].endsWith('generate-icons.js')) {
  generateAllIcons('./icons');
}
