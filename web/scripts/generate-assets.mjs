import sharp from 'sharp';
import { writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ogSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="0" y="0" width="4" height="630" fill="#16a34a"/>
  <g transform="translate(180, 315)">
    <rect x="-90" y="-58" width="180" height="116" rx="58" fill="#f0f0f0"/>
    <ellipse cx="-36" cy="0" rx="33" ry="25" fill="#0a0a0a"/>
    <ellipse cx="36" cy="0" rx="33" ry="25" fill="#0a0a0a"/>
    <path d="M-20 58 L0 88 L20 58Z" fill="#f0f0f0"/>
  </g>
  <text x="380" y="270" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="700" fill="#f0f0f0">GitGuise</text>
  <text x="380" y="340" font-family="Inter, Arial, sans-serif" font-size="32" fill="#888888">Git, without the identity crisis.</text>
  <text x="380" y="520" font-family="Inter, Arial, sans-serif" font-size="24" fill="#666666">gitguise.dev</text>
</svg>`;

const markSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#111111"/>
  <g transform="translate(256, 240)">
    <rect x="-120" y="-78" width="240" height="156" rx="78" fill="#f0f0f0"/>
    <ellipse cx="-48" cy="0" rx="44" ry="34" fill="#0a0a0a"/>
    <ellipse cx="48" cy="0" rx="44" ry="34" fill="#0a0a0a"/>
    <path d="M-26 78 L0 118 L26 78Z" fill="#f0f0f0"/>
  </g>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(join(root, 'og-image.png'));
await sharp(Buffer.from(ogSvg)).png().toFile(join(root, 'public', 'og-image.png'));

const mark = sharp(Buffer.from(markSvg));
await mark.clone().resize(32, 32).png().toFile(join(root, 'favicon-32.png'));
await mark.clone().resize(16, 16).png().toFile(join(root, 'favicon-16.png'));
await mark.clone().resize(180, 180).png().toFile(join(root, 'apple-touch-icon.png'));

copyFileSync(join(root, 'public', 'logo.svg'), join(root, 'logo.svg'));

console.log('Generated og-image.png, favicons, and logo.svg at web root');
