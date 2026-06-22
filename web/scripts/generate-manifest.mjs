import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const basePath = (process.env.VITE_BASE_PATH ?? '/').replace(/\/$/, '');
const defaultLocal = `http://localhost:5173${basePath === '' ? '' : basePath}`;
const siteUrl = (process.env.VITE_SITE_URL ?? defaultLocal).replace(/\/$/, '');

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
