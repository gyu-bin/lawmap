const fs = require("fs");
const path = require("path");

/** 로컬·Vercel 모두 node_modules/.bin/korean-law 우선 */
function resolveKoreanLawBin(rootDir) {
  const root = rootDir || path.join(__dirname, "..");
  const local = path.join(root, "node_modules", ".bin", "korean-law");
  if (fs.existsSync(local)) return local;
  return "korean-law";
}

module.exports = { resolveKoreanLawBin };
