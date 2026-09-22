// Gera os ícones PWA a partir de public/icons/icon.svg: node scripts/generate-icons.mjs
import sharp from "sharp";
const src = "public/icons/icon.svg";
const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["apple-touch-icon.png", 180, 0],
  ["icon-maskable-512.png", 512, 56],
];
for (const [name, size, pad] of out) {
  const inner = size - pad * 2;
  const img = await sharp(src).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#226e40" } })
    .composite([{ input: img, top: pad, left: pad }])
    .png()
    .toFile(`public/icons/${name}`);
}
console.log("ícones gerados");
