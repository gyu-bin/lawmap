/** 법령 검색 결과 정리 유틸 */

const NOISE_LAW_NAMES = [
  /^난민법/,
  /^민법법인/,
  /^구강보건/,
  /^물관리/,
  /^성희롱/
];

function dedupeHits(hits) {
  const seen = new Set();
  return hits.filter((h) => {
    const key = `${h.name}|${h.clause || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isNoiseLaw(name) {
  return NOISE_LAW_NAMES.some((re) => re.test(name));
}

module.exports = {
  dedupeHits,
  isNoiseLaw
};
