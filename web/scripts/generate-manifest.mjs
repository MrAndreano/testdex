import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');

/** GitHub Pages canonical host is lowercase; TonConnect compares URLs strictly. */
function normalizeSiteUrl(raw) {
  const trimmed = raw.replace(/\/$/, '');
  try {
    const url = new URL(trimmed);
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return trimmed.toLowerCase();
  }
}

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL ?? 'http://localhost:5173');

const manifest = {
  url: siteUrl,
  name: 'TestDex',
  iconUrl: `${siteUrl}/icon-180.png`,
  termsOfUseUrl: siteUrl,
  privacyPolicyUrl: siteUrl,
};

mkdirSync(publicDir, { recursive: true });
writeFileSync(join(publicDir, 'tonconnect-manifest.json'), JSON.stringify(manifest, null, 2));

console.log('Generated public/tonconnect-manifest.json');
console.log('  url:', manifest.url);
console.log('  iconUrl:', manifest.iconUrl);
