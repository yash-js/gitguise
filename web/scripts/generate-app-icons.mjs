import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Generates the GitGuise app icon (used by electron-builder for win/mac/linux)
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appAssets = join(webRoot, '..', 'app', 'src', 'assets');

const iconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#111111"/>
  <rect x="16" y="16" width="480" height="480" rx="100" fill="#0d0d0d"/>
  <g transform="translate(256, 240)">
    <rect x="-120" y="-78" width="240" height="156" rx="78" fill="#f0f0f0"/>
    <ellipse cx="-48" cy="0" rx="44" ry="34" fill="#0d0d0d"/>
    <ellipse cx="48" cy="0" rx="44" ry="34" fill="#0d0d0d"/>
    <path d="M-26 78 L0 118 L26 78Z" fill="#f0f0f0"/>
  </g>
</svg>`;

await sharp(Buffer.from(iconSvg)).png().toFile(join(appAssets, 'icon.png'));

console.log('Generated app/src/assets/icon.png (1024x1024)');
