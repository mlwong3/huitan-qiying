// 繪壇耆英 — line-art storage abstraction.
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

function publicUrl(objectName) {
  return `https://storage.googleapis.com/${BUCKET}/${objectName}`;
}

// Returns [{ name, url }]
async function list() {
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    return files
      .filter((f) => IMAGE_RE.test(f.name))
      .map((f) => ({ name: f.name.slice(PREFIX.length), url: publicUrl(f.name) }));
  }
  if (!fs.existsSync(LINEARTS_DIR)) return [];
  return fs
    .readdirSync(LINEARTS_DIR)
    .filter((f) => IMAGE_RE.test(f))
    .map((name) => ({ name, url: '/linearts/' + encodeURIComponent(name) }));
}

async function save(buffer, name, contentType) {
  if (bucket) {
    const objectName = PREFIX + name;
    await bucket.file(objectName).save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: CACHE },
    });
    return { name, url: publicUrl(objectName) };
  }
  if (!fs.existsSync(LINEARTS_DIR)) fs.mkdirSync(LINEARTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LINEARTS_DIR, name), buffer);
  return { name, url: '/linearts/' + encodeURIComponent(name) };
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

module.exports = { list, save, remove, usingBucket };
