import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("assets/vendor", { recursive: true });
await build({
  entryPoints: ["node_modules/qrcode/lib/browser.js"],
  bundle: true,
  format: "iife",
  globalName: "QRCode",
  platform: "browser",
  target: ["es2017"],
  minify: true,
  outfile: "assets/vendor/qrcode.min.js"
});
await copyFile("node_modules/qrcode/license", "assets/vendor/QRCODE_LICENSE.txt");
console.log("Built local QR code bundle with MIT license.");
