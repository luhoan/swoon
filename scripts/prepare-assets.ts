/**
 * Derives web assets from the original brand files without touching them:
 *   logo.png  -> public/brand/favicon.png (64), app-icon.png (512)
 *   title.png -> public/brand/swan.png      transparent swan mark
 *             -> public/brand/wordmark.png  transparent "Swoon" wordmark
 *             -> public/brand/lockup.png    transparent full lockup
 *
 * The title art is flat color on white, so transparency is recovered by
 * un-compositing: observed = true*a + white*(1-a), with a taken from the
 * darkest channel. This keeps the wing's gradient and the heart's pink.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const out = join(root, "public", "brand");
mkdirSync(out, { recursive: true });

interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function extractOnTransparent(
  source: string,
  region: Region,
  target: string,
  resizeWidth?: number,
) {
  const { data, info } = await sharp(source)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = info.width * info.height;
  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    const r = data[i * 3]!;
    const g = data[i * 3 + 1]!;
    const b = data[i * 3 + 2]!;
    // alpha from distance-to-white of the darkest channel; the cutoff also
    // strips the source art's faint paper-texture speckles
    const a = 255 - Math.min(r, g, b);
    if (a < 24) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    // un-composite each channel from the white background
    const un = (c: number) =>
      Math.max(0, Math.min(255, Math.round(((c - (255 - a)) * 255) / a)));
    rgba[i * 4] = un(r);
    rgba[i * 4 + 1] = un(g);
    rgba[i * 4 + 2] = un(b);
    rgba[i * 4 + 3] = a;
  }

  let img = sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).trim({ threshold: 8 });
  if (resizeWidth) img = img.resize({ width: resizeWidth });
  await img.png().toFile(join(out, target));
}

async function main() {
  const logo = join(root, "logo.png");
  const title = join(root, "title.png");

  // Hero product shot: trim the transparent margin (keeping the soft drop
  // shadow) so layout controls the spacing, then compress.
  await sharp(join(root, "hero-phones.png"))
    .trim({ threshold: 1 })
    .resize({ width: 1100, withoutEnlargement: true })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(join(out, "hero-phones.png"));

  await sharp(logo).resize(64, 64).png().toFile(join(out, "favicon.png"));
  await sharp(logo).resize(512, 512).png().toFile(join(out, "app-icon.png"));

  // Regions measured on the 1254x1254 title.png.
  await extractOnTransparent(
    title,
    { left: 360, top: 240, width: 540, height: 462 },
    "swan.png",
    640,
  );
  await extractOnTransparent(
    title,
    { left: 300, top: 730, width: 660, height: 150 },
    "wordmark.png",
    640,
  );
  await extractOnTransparent(
    title,
    { left: 300, top: 240, width: 660, height: 720 },
    "lockup.png",
    800,
  );

  console.log("brand assets written to public/brand");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
