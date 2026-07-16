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

// 掌櫃分類（§13）：每張上載圖片屬於「畫布」（揀紙開畫／開房用嘅背景）或
// 「線稿」（共繪個人畫布嘅半透明描圖底）其中一種，用檔名前綴 marker 記住，
// 唔使另開資料庫。舊檔（上呢個功能之前上載、冇 marker）預設當「畫布」，
// 保持佢哋喺揀紙畫廊嘅行為唔變。
const CATEGORY_CANVAS = 'canvas';
const CATEGORY_LINEART = 'lineart';
const CATEGORIES = [CATEGORY_CANVAS, CATEGORY_LINEART];
const MARKER_RE = /^(canvas|lineart)__/;

function categoryOf(name) {
  const m = name.match(MARKER_RE);
  return m ? m[1] : CATEGORY_CANVAS;
}

function withCategory(name, category) {
  return `${category}__${name}`;
}

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

// Returns [{ name, url, category }]. Pass `category` ('canvas' | 'lineart')
// to filter; omit to return everything (used by the 掌櫃 admin panel).
async function list(category) {
  let items;
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    items = files
      .filter((f) => IMAGE_RE.test(f.name))
      .map((f) => {
        const name = f.name.slice(PREFIX.length);
        return { name, url: proxyUrl(name), category: categoryOf(name) };
      });
  } else if (!fs.existsSync(LINEARTS_DIR)) {
    items = [];
  } else {
    items = fs
      .readdirSync(LINEARTS_DIR)
      .filter((f) => IMAGE_RE.test(f))
      .map((name) => ({ name, url: proxyUrl(name), category: categoryOf(name) }));
  }
  return category ? items.filter((i) => i.category === category) : items;
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

async function save(buffer, name, contentType, category) {
  const cat = CATEGORIES.includes(category) ? category : CATEGORY_CANVAS;
  const finalName = withCategory(name, cat);
  if (bucket) {
    const objectName = PREFIX + finalName;
    await bucket.file(objectName).save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: CACHE },
    });
    return { name: finalName, url: proxyUrl(finalName), category: cat };
  }
  if (!fs.existsSync(LINEARTS_DIR)) fs.mkdirSync(LINEARTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LINEARTS_DIR, finalName), buffer);
  return { name: finalName, url: proxyUrl(finalName), category: cat };
}

// 掌櫃「轉為畫布／轉為線稿」：唔使刪除再重新上載，直接改個 marker（bucket
// 用 copy+delete 模擬 rename；本機磁碟直接 rename）。傳返新嘅 {name, url,
// category}，搵唔到就傳 null。
async function recategorize(name, newCategory) {
  if (!CATEGORIES.includes(newCategory)) return null;
  const bareName = name.replace(MARKER_RE, '');
  const finalName = withCategory(bareName, newCategory);
  if (finalName === name) return { name, url: proxyUrl(name), category: newCategory };
  if (bucket) {
    const src = bucket.file(PREFIX + name);
    const [exists] = await src.exists();
    if (!exists) return null;
    await src.copy(bucket.file(PREFIX + finalName));
    await src.delete();
    return { name: finalName, url: proxyUrl(finalName), category: newCategory };
  }
  const from = path.join(LINEARTS_DIR, name);
  const to = path.join(LINEARTS_DIR, finalName);
  if (!fs.existsSync(from)) return null;
  fs.renameSync(from, to);
  return { name: finalName, url: proxyUrl(finalName), category: newCategory };
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

module.exports = {
  list, save, remove, recategorize, usingBucket, streamLineart,
  CATEGORY_CANVAS, CATEGORY_LINEART,
};
