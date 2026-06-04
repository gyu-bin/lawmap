/** korean-law CLI / 종합 리서치 텍스트 파싱 */

const SCENARIO_QUERIES = {
  layoff: ["근로기준법"],
  rent: ["주택임대차보호법"],
  refund: ["전자상거래 등에서의 소비자보호에 관한 법률", "전자상거래"],
  bullying: ["근로기준법"],
  salary: ["근로기준법"],
  general: ["도로교통법", "민법"]
};

const NOISE_LAW_NAMES = [
  /^난민법/,
  /^민법법인/,
  /^구강보건/,
  /^물관리/,
  /^성희롱/
];

function isSplashSituation(text) {
  const t = (text || "").trim();
  return (
    (t.includes("물") && (t.includes("벼락") || t.includes("웅덩"))) ||
    t.includes("자동차") ||
    t.includes("차량")
  );
}

function scenarioSearchQueries(scenario, userText) {
  if (isSplashSituation(userText)) {
    return ["도로교통법", "자동차관리법", "민법"];
  }
  const base = SCENARIO_QUERIES[scenario] || SCENARIO_QUERIES.general;
  return [...new Set(base)];
}

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

function normalizeClause(line) {
  const m = line.match(/제\s*0*(\d+조(?:의\d+)?)/);
  return m ? `제${m[1]}` : line.split("(")[0].trim();
}

/** search_law 출력 — 정확매칭 구간만 */
function parseExactSearchLawHits(text) {
  if (!text) return [];
  let chunk = text;
  if (text.includes("📍 정확매칭")) {
    chunk = text.split("📂 부분매칭")[0];
  } else if (text.includes("📂 부분매칭") && !text.includes("📍 정확매칭")) {
    return [];
  }
  return parseLawBlocks(chunk);
}

function parseLawBlocks(text) {
  const hits = [];
  const blockRe =
    /(\d+)\.\s+([^\n]+)\n\s*-\s*법령ID:\s*(\S+)\s*\n\s*-\s*MST:\s*(\S+)(?:\s*\n\s*-\s*공포일:\s*(\S+))?(?:\s*\n\s*-\s*구분:\s*([^\n]+))?/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const name = m[2].trim();
    if (isNoiseLaw(name)) continue;
    hits.push({
      name,
      lawId: m[3],
      mst: m[4],
      lawType: m[6] ? m[6].trim() : "법령",
      clause: "관련 조문",
      link: `https://www.law.go.kr/법령/${encodeURIComponent(name)}`
    });
  }
  return hits;
}

/** 종합 리서치 AI 법령검색 조문 블록 */
function parseAiLawArticles(text) {
  if (!text || !text.includes("법령검색")) return [];

  let section = text;
  const aiStart = text.indexOf("▶ AI 법령검색");
  if (aiStart >= 0) {
    section = text.slice(aiStart);
    const next = section.indexOf("\n▶ ");
    if (next > 0) section = section.slice(0, next);
  }

  const hits = [];
  const blocks = section.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) continue;

    const lawName = lines[0].replace(/\s+/g, " ");
    if (lawName.length > 60 || lawName.length < 3) continue;
    if (!/(법|령|규칙|조례|특례)/.test(lawName)) continue;
    if (isNoiseLaw(lawName)) continue;

    let clause = "";
    let snippet = "";
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^제\d+조/.test(line) && !clause) {
        clause = normalizeClause(line);
      }
      if (
        line.length > 25 &&
        !/^제\d+조/.test(line) &&
        !line.startsWith("시행:") &&
        !line.startsWith("💡")
      ) {
        snippet = line.replace(/\s+/g, " ").slice(0, 320);
        break;
      }
    }

    if (!clause && !snippet) continue;

    hits.push({
      name: lawName,
      clause: clause || "관련 조문",
      lawType: "상황 연관 조문",
      core: snippet
        ? snippet.length > 140
          ? `${snippet.slice(0, 140)}…`
          : snippet
        : `${lawName} ${clause}`,
      desc: snippet || `${lawName}에서 상황과 관련될 수 있는 조항입니다.`,
      link: clause
        ? `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${clause}`
        : `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
    });
  }

  return dedupeHits(hits);
}

function parseLawHitsFromText(text) {
  return dedupeHits([
    ...parseExactSearchLawHits(text),
    ...parseAiLawArticles(text)
  ]);
}

function rankHitsForSituation(hits, userText) {
  const splash = isSplashSituation(userText);
  const score = (h) => {
    let s = 0;
    const n = h.name || "";
    if (splash) {
      if (/도로교통|자동차/.test(n)) s += 30;
      if (n === "민법") s += 25;
      if (/민법/.test(n) && h.clause && /750/.test(h.clause)) s += 40;
      if (/시행령|시행규칙/.test(n)) s += 5;
      if (isNoiseLaw(n)) s -= 100;
    }
    if (h.core && h.core.length > 40) s += 10;
    if (h.clause && h.clause !== "관련 조문") s += 8;
    return s;
  };
  return [...hits].sort((a, b) => score(b) - score(a));
}

function buildSplashSummaryGuide(hits, userText) {
  const top = hits.slice(0, 4);
  if (top.length === 0) return "";

  const lines = [
    "【상황 정리】 비 오는 날 차량이 물웅덩이를 지나며 발생한 물벼락 피해는, 통상 불법행위(민법)와 도로교통 관련 규정을 함께 검토합니다.",
    "",
    "【우선 확인할 법령·조문】"
  ];
  top.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.name} ${h.clause}${h.core ? ` — ${h.core}` : ""}`);
  });
  lines.push(
    "",
    "【실무 팁】 차량 번호·사고 시각·목격자·CCTV·의류 오염 사진을 확보하고, 가해 차량 보험사 또는 경찰(112) 상담을 검토하세요."
  );
  return lines.join("\n");
}

module.exports = {
  scenarioSearchQueries,
  parseLawHitsFromText,
  parseExactSearchLawHits,
  parseAiLawArticles,
  rankHitsForSituation,
  buildSplashSummaryGuide,
  isSplashSituation,
  dedupeHits
};
