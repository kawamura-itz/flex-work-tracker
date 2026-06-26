// Build-time fetch of Japanese national holidays from the Cabinet Office CSV.
// The CSV is Shift_JIS encoded; we decode and emit UTF-8 JSON to public/holidays.json.
// Run: node scripts/fetch-holidays.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'holidays.json');

function normalizeDate(raw) {
  // Source uses formats like "2026/1/1" or "2026/01/01".
  const m = raw.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function main() {
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = new TextDecoder('shift_jis').decode(buf);
  const lines = text.split(/\r?\n/).filter(Boolean);
  // First line is a header: 国民の祝日・休日月日,国民の祝日・休日名称
  const out = [];
  for (const line of lines.slice(1)) {
    const [dateRaw, name] = line.split(',');
    const date = normalizeDate(dateRaw);
    if (date) out.push({ date, name: (name ?? '').trim() });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`wrote ${out.length} holidays -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
