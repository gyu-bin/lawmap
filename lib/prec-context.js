/** 판례 — 상황 맥락(직장·교통 등) 점수 보정 */

const WORKPLACE_SIGNALS = [
  "직장",
  "근로",
  "사용자",
  "상사",
  "해고",
  "부당노동",
  "직장내",
  "괴롭힘",
  "근로자",
  "취업규칙",
  "노동위원회",
  "부당해고",
  "업무상"
];

function precTextBlob(hit) {
  return `${hit.caseName || ""} ${hit.caseFacts || ""} ${hit.gist || ""} ${hit.holding || ""}`;
}

function isWorkplaceSituation(analysis = {}) {
  if (analysis.precDomain === "workplace") return true;
  const blob = [
    analysis.label,
    analysis.situationSummary,
    ...(analysis.precSituationKeywords || [])
  ].join(" ");
  return /직장|괴롭힘|상사|근로|퇴근|해고|사용자|폭언|업무연락/.test(blob);
}

function workplaceContextScore(blob) {
  return WORKPLACE_SIGNALS.filter((s) => blob.includes(s)).length;
}

function countKeywordHits(blob, title, keywords) {
  let hits = 0;
  for (const kw of keywords || []) {
    if (kw.length < 2) continue;
    if (blob.includes(kw) || title.includes(kw)) {
      hits++;
      continue;
    }
    const tokens = kw.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length >= 2) {
      const matched = tokens.filter((t) => blob.includes(t) || title.includes(t)).length;
      if (matched >= Math.ceil(tokens.length / 2)) hits++;
    } else if (tokens[0] && (blob.includes(tokens[0]) || title.includes(tokens[0]))) {
      hits++;
    }
  }
  return hits;
}

function isPureCriminalDefamation(caseName, blob) {
  const title = caseName || "";
  return (
    /명예훼손|모욕/.test(title) &&
    !/직장|근로|해고|부당|괴롭힘|사용자|노동/.test(`${title} ${blob}`)
  );
}

/**
 * 직장 상황일 때 노동·행정 사건 가산, 형사 명예훼손(비직장) 감점
 */
function adjustScoreForContext(hit, analysis, baseScore) {
  if (!isWorkplaceSituation(analysis)) return baseScore;

  const blob = precTextBlob(hit);
  const title = hit.caseName || "";
  let score = baseScore;
  score += workplaceContextScore(blob) * 9;

  if (isPureCriminalDefamation(title, blob)) score -= 28;
  if (/부당노동|해고무효|부당해고|직장내/.test(title + blob)) score += 15;

  return Math.min(100, Math.max(0, score));
}

module.exports = {
  isWorkplaceSituation,
  workplaceContextScore,
  isPureCriminalDefamation,
  adjustScoreForContext,
  precTextBlob,
  countKeywordHits
};
