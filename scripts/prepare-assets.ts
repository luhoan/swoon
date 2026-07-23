/**
 * Derives web assets from the original brand files without touching them:
 *   logo.png  -> public/brand/favicon.png (64), app-icon.png (512)
 *   title.png -> public/brand/title.png (1024 wide, for social/og use)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const out = join(root, "public", "brand");
mkdirSync(out, { recursive: true });

async function main() {
  await sharp(join(root, "logo.png")).resize(64, 64).png().toFile(join(out, "favicon.png"));
  await sharp(join(root, "logo.png")).resize(512, 512).png().toFile(join(out, "app-icon.png"));
  await sharp(join(root, "title.png")).resize(1024).png().toFile(join(out, "title.png"));
  console.log("brand assets written to public/brand");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
