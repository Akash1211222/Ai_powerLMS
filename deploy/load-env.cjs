/**
 * Minimal .env loader (no dotenv dependency).
 * Supports KEY=value and KEY='value' / KEY="value". Skips blanks/comments.
 * Safe for values containing & ? # (unlike bash `source`).
 */
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing env file: ${abs}`);
  }
  const out = {};
  for (const raw of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Merge file into process.env (does not overwrite already-set keys). */
function applyEnvFile(filePath, { override = false } = {}) {
  const parsed = loadEnvFile(filePath);
  for (const [key, val] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return parsed;
}

module.exports = { loadEnvFile, applyEnvFile };
