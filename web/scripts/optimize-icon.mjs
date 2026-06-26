import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconPath = join(__dirname, '..', 'public', 'icon-180.png');
const tmpPath = `${iconPath}.tmp`;

if (!existsSync(iconPath)) {
  console.warn('optimize-icon: public/icon-180.png not found, skipping');
  process.exit(0);
}

const meta = await sharp(iconPath).metadata();
if (meta.width === 180 && meta.height === 180 && statSync(iconPath).size < 80_000) {
  console.log('optimize-icon: already 180x180, skipping');
  process.exit(0);
}

await sharp(iconPath)
  .resize(180, 180, { fit: 'cover', position: 'centre' })
  .png({ compressionLevel: 9, palette: true })
  .toFile(tmpPath);

unlinkSync(iconPath);
renameSync(tmpPath, iconPath);

const out = await sharp(iconPath).metadata();
console.log(`optimize-icon: resized to ${out.width}x${out.height}, ${statSync(iconPath).size} bytes`);
