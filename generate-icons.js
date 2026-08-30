import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// SDF Distance Functions
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.sqrt(Math.max(0, qx) ** 2 + Math.max(0, qy) ** 2) - r;
}

function isInsideSparkle(x, y, cx, cy, R) {
  const u = Math.abs(x - cx) / R;
  const v = Math.abs(y - cy) / R;
  if (u >= 1.0 || v >= 1.0) return false;
  return Math.pow(u, 0.52) + Math.pow(v, 0.52) <= 1.0;
}

/**
 * Renders the iconic Bilibili TV mascot into a crisp anti-aliased PNG.
 * Primary color: Bilibili Cyan Blue #23ADE5 (RGB: 35, 173, 229)
 * Eyes: Authentic Shining Sparkle Stars (✨ Emoji Style)
 */
export function createBilibiliIconPNG(size) {
  const S = size;
  const lineSize = 1 + S * 4;
  const raw = Buffer.alloc(S * lineSize);

  // Primary Bilibili Blue: #23ADE5 -> RGB(35, 173, 229)
  const [R, G, B] = [35, 173, 229];
  const pixelDelta = 2.0 / S; // Size of 1 pixel in normalized [-1, 1] coords

  // Geometry tailored for crisp appearance at all resolutions (16, 48, 128)
  const tvCenterY = 0.16;
  const tvHalfW = 0.62;
  const tvHalfH = 0.44;
  const tvRadius = 0.18;
  const strokeW = size <= 16 ? 0.15 : size <= 48 ? 0.12 : 0.10;

  // Left antenna: from (-0.24, tvCenterY - tvHalfH) to (-0.46, -0.66)
  const a1x = -0.24, a1y = tvCenterY - tvHalfH + 0.04;
  const a1bx = -0.46, a1by = -0.66;

  // Right antenna: from (0.24, tvCenterY - tvHalfH) to (0.46, -0.66)
  const a2x = 0.24, a2y = tvCenterY - tvHalfH + 0.04;
  const a2bx = 0.46, a2by = -0.66;

  // Shining Sparkle Eyes (✨)
  const eyeOffsetX = 0.24;
  const eyeCenterY = tvCenterY + 0.02;
  const starR = size <= 16 ? 0.22 : size <= 48 ? 0.19 : 0.18;

  const subSteps = [-0.375, -0.125, 0.125, 0.375];

  for (let py = 0; py < S; py++) {
    const lineOffset = py * lineSize;
    raw[lineOffset] = 0; // Filter None

    const y = (py + 0.5) / S * 2 - 1;

    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) / S * 2 - 1;
      const offset = lineOffset + 1 + px * 4;

      // 1. Distance to TV box outline
      const dBox = Math.abs(sdRoundedBox(x, y - tvCenterY, tvHalfW, tvHalfH, tvRadius)) - strokeW / 2;

      // 2. Distance to antennae
      const dAnt1 = sdSegment(x, y, a1x, a1y, a1bx, a1by) - strokeW / 2;
      const dAnt2 = sdSegment(x, y, a2x, a2y, a2bx, a2by) - strokeW / 2;

      // Distance to blue body (box and antennae)
      const dBody = Math.min(dBox, dAnt1, dAnt2);
      const alphaBody = Math.max(0, Math.min(1, 0.5 - dBody / (pixelDelta * 1.2)));

      // 3. Shining Sparkle Stars (✨) with 4x4 anti-aliasing
      let insideCount = 0;
      for (const sdy of subSteps) {
        const sy = y + sdy * pixelDelta;
        for (const sdx of subSteps) {
          const sx = x + sdx * pixelDelta;
          if (isInsideSparkle(sx, sy, -eyeOffsetX, eyeCenterY, starR) ||
              isInsideSparkle(sx, sy, eyeOffsetX, eyeCenterY, starR)) {
            insideCount++;
          }
        }
      }
      const alphaStar = insideCount / 16;

      if (alphaStar > 0) {
        // ✨ Emoji Golden Sparkle:
        // Center has brilliant luminous shine, tapering into warm sunny golden arms
        const distRatio = Math.min(
          Math.hypot(x - (-eyeOffsetX), y - eyeCenterY),
          Math.hypot(x - eyeOffsetX, y - eyeCenterY)
        ) / starR;

        const shine = Math.max(0, 1 - distRatio / 0.40);
        const starR_val = 255;
        const starG_val = Math.round(185 + 65 * shine);
        const starB_val = Math.round(15 + 230 * (shine ** 2));

        raw[offset] = starR_val;
        raw[offset + 1] = starG_val;
        raw[offset + 2] = starB_val;
        raw[offset + 3] = Math.round(alphaStar * 255);
      } else if (alphaBody > 0) {
        // Bilibili Cyan Blue: #23ADE5 -> RGB(35, 173, 229)
        raw[offset] = R;
        raw[offset + 1] = G;
        raw[offset + 2] = B;
        raw[offset + 3] = Math.round(alphaBody * 255);
      } else {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 0;
      }
    }
  }

  // PNG chunk builder
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);

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
  ihdrData.writeUInt32BE(S, 0);
  ihdrData.writeUInt32BE(S, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT
  const idat = makeChunk('IDAT', zlib.deflateSync(raw));

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
    const png = createBilibiliIconPNG(size);
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
    console.log(`Generated icon: icon${size}.png in ${outDir}`);
  }
}

// Run directly if invoked
if (process.argv[1] && process.argv[1].endsWith('generate-icons.js')) {
  generateAllIcons('./icons');
}
