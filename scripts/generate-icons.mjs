import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
for (const size of [192, 512])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
console.log("Generated PWA icons from public/icon.svg.");
