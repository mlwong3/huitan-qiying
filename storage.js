// 繪畫耆才 — line-art storage abstraction.
// If STORAGE_BUCKET is set, persist to Firebase Storage (Google Cloud Storage)
// via firebase-admin with Application Default Credentials (Cloud Run provides
// these automatically). Otherwise fall back to local disk for development.

const path = require('path');
const fs = require('fs');

const LINEARTS_DIR = path.join(__dirname, 'linearts');
const BUCKET = process.env.STORAGE_BUCKET || '';
const PREFIX = 'linearts/';
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const CACHE = 'public, max-age=86400';

let bucket = null;
if (BUCKET) {
  try {
    const admin = require('firebase-admin');
    // Omitting `credential` makes firebase-admin use Application Default
    // Credentials automatically (Cloud Run / GCE metadata, or
    // GOOGLE_APPLICATION_CREDENTIALS locally) — works across firebase-admin v12.
    admin.initializeApp({ storageBucket: BUCKET });
    bucket = admin.storage().bucket();
    console.log('[storage] Firebase Storage bucket:', BUCKET);
  } catch (e) {
    console.warn('[storage] firebase-admin init failed, using local disk:', e.message);
    bucket = null;
  }
}

function usingBucket() {
  return !!bucket;
}

// Same-origin proxy path. Even in bucket mode we return this (NOT the raw
// storage.googleapis.com URL) so the browser always loads line-art from our own
// origin. This matters because the board composites the line-art onto a <canvas>
// then calls toDataURL() when saving/sealing a work — a cross-origin image with
// no CORS header taints the canvas and makes toDataURL() throw a SecurityError,
// which silently broke 封存作品 / 保存圖片 whenever a 畫紙 (line-art) was in use.
function proxyUrl(name) {
  return '/linearts/' + encodeURIComponent(name);
}

// Returns [{ name, url }]
async function list() {
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    return files
      .filter((f) => IMAGE_RE.test(f.name))
      .map((f) => {
        const name = f.name.slice(PREFIX.length);
        return { name, url: proxyUrl(name) };
      });
  }
  if (!fs.existsSync(LINEARTS_DIR)) return [];
  return fs
    .readdirSync(LINEARTS_DIR)
    .filter((f) => IMAGE_RE.test(f))
    .map((name) => ({ name, url: proxyUrl(name) }));
}

// Pipe a bucket-stored line-art to the response (bucket mode only).
// Returns true if it handled the request (found or 404'd), false if not in
// bucket mode (caller should fall through to the disk static handler).
async function streamLineart(name, res) {
  if (!bucket) return false;
  const file = bucket.file(PREFIX + name);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).end();
    return true;
  }
  const [meta] = await file.getMetadata();
  res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
  res.setHeader('Cache-Control', CACHE);
  file
    .createReadStream()
    .on('error', () => { if (!res.headersSent) res.status(500).end(); })
    .pipe(res);
  return true;
}

async function save(buffer, name, contentType) {
  if (bucket) {
    const objectName = PREFIX + name;
    await bucket.file(objectName).save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: CACHE },
    });
    return { name, url: proxyUrl(name) };
  }
  if (!fs.existsSync(LINEARTS_DIR)) fs.mkdirSync(LINEARTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LINEARTS_DIR, name), buffer);
  return { name, url: proxyUrl(name) };
}

// Returns true on success, false if the file did not exist.
async function remove(name) {
  if (bucket) {
    try {
      await bucket.file(PREFIX + name).delete();
      return true;
    } catch (e) {
      return false;
    }
  }
  const target = path.join(LINEARTS_DIR, name);
  if (!fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  return true;
}

module.exports = { list, save, remove, usingBucket, streamLineart };
