// Downloads the report fonts (ADR 0026, ADR 0027) into apps/worker/fonts/ (or REPORT_FONTS_DIR)
// and verifies each file's SHA-256. Files already present with the right hash are kept, so a
// second run downloads nothing. Exits non-zero on any mismatch. Fonts are SIL OFL; never commit them.
'use strict';
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Pinned to one noto-cjk commit, so the bytes (and the hashes below) never move.
const BASE = 'https://github.com/notofonts/noto-cjk/raw/165c01b46ea533872e002e0785ff17e44f6d97d8';
const FONTS = [
  { file: 'NotoSansJP-Regular.otf', url: `${BASE}/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf`, sha256: 'dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073' },
  { file: 'NotoSansJP-Bold.otf', url: `${BASE}/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf`, sha256: '1b0edfb500b73a4fa8a4fcaae1bbbd403994e08e73e3e0da37e70d3853f42c5f' },
  { file: 'NotoSansMonoCJKjp-Regular.otf', url: `${BASE}/Sans/Mono/NotoSansMonoCJKjp-Regular.otf`, sha256: '4d01725be822d144cf9a56ade981e6fb920cd7a610b8fc24cc601a920beea5b9' },
];

const dir = process.env.REPORT_FONTS_DIR ?? path.join(__dirname, '..', 'fonts');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  let failed = false;
  for (const font of FONTS) {
    const target = path.join(dir, font.file);
    if (fs.existsSync(target) && hash(fs.readFileSync(target)) === font.sha256) {
      console.log(`ok          ${font.file}`);
      continue;
    }
    const response = await fetch(font.url);
    if (!response.ok) {
      console.error(`FAILED      ${font.file}: HTTP ${response.status}`);
      failed = true;
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = hash(bytes);
    if (actual !== font.sha256) {
      console.error(`MISMATCH    ${font.file}: expected ${font.sha256}, got ${actual}`);
      failed = true;
      continue;
    }
    fs.writeFileSync(target, bytes);
    console.log(`downloaded  ${font.file} (${(bytes.length / 1048576).toFixed(1)} MB)`);
  }
  if (failed) process.exitCode = 1;
}

module.exports = { FONTS };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
