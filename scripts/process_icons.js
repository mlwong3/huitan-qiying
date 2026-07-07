// One-off script: crop watermark + convert user-supplied JPEG line-art icons
// into transparent-background black-line PNGs, ready for SVG feColorMatrix tinting
// (see elementSvg() in public/script.js). Run with:
//   node scripts/process_icons.js
// (needs `sharp`, already a devDependency — run from the project root so it
// resolves node_modules).
const sharp = require('sharp');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'Photo');
const OUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'icons');

// Add new source files + output keys here to process more icons the same way.
const ITEMS = [
  { file: 'Cloud.jpeg', key: 'cloud' },
  { file: 'Flower.jpeg', key: 'blossom' },
  { file: 'Home.jpeg', key: 'house' },
  { file: 'Human.jpeg', key: 'person' },
  { file: 'Tree.jpeg', key: 'tree' },
];

// Watermark sits bottom-right, roughly x:850-1024, y:890-1024 on the 1024x1024 source.
const WATERMARK = { left: 850, top: 890, width: 174, height: 134 };
const OUT_SIZE = 256; // final icons render at most ~200px — downscale after thresholding at full res

async function processOne({ file, key }) {
  const srcPath = path.join(SRC_DIR, file);

  const cleaned = await sharp(srcPath)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cleaned; // 1 channel (grayscale), full 1024x1024
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      const inWatermark = x >= WATERMARK.left && x < WATERMARK.left + WATERMARK.width
        && y >= WATERMARK.top && y < WATERMARK.top + WATERMARK.height;
      const lum = data[i];
      // Dark line strokes -> opaque black; light/white background -> transparent.
      // Soft threshold keeps a little anti-aliasing instead of a hard jagged edge.
      // Watermark region is forced fully transparent (no seam vs. a colour patch).
      const CUTOFF = 190; // background clusters ~200-215, line strokes ~0-50 (histogram-verified)
      const alpha = inWatermark ? 0 : (lum >= CUTOFF ? 0 : Math.round(255 * (1 - lum / CUTOFF)));
      out[i * 4 + 0] = 0;
      out[i * 4 + 1] = 0;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = Math.min(255, alpha);
    }
  }

  const outPath = path.join(OUT_DIR, key + '.png');
  // Resize AFTER thresholding at full 1024 res (avoids resampling bleed on the raw
  // watermark cut, and sharp handles alpha-aware/premultiplied resize correctly).
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(OUT_SIZE, OUT_SIZE)
    .png()
    .toFile(outPath);
  console.log('wrote', outPath, OUT_SIZE + 'x' + OUT_SIZE);
}

(async () => {
  for (const item of ITEMS) {
    await processOne(item);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
