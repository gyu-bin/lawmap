/**
 * 상황 검색 — 매 요청마다 법제처 Open API(DRF) 네트워크 호출만 사용
 * playbook / 시나리오 고정 법령 목록 없음
 */
const { isNoiseLaw, dedupeHits } = require("./parse-korean-law.js");
const { getArticleText, getOc } = require("./law-go-kr-api.js");

const BASE = "https://www.law.go.kr/DRF";
const STOPWORDS = new Set([
  "그리고",
  "하지만",
  "해서",
  "하는",
  "했는데",
  "있는",
  "없는",
  "이런",
  "저런",
  "어떻게",
  "아닌가요",
  "인가요",
  "습니다",
  "해요",
  "있어요",
  "했어요",
  "되나요",
  "인지",
  "관련",
  "상황",
  "경우",
  "때문",
  "정말",
  "너무",
  "많이",
  "제가",
  "저는",
  "우리",
  "집에"
]);

function extractJoFromText(text) {
  const m = String(text).match(/제\s*0*(\d+조(?:의\d+)?)/);
  return m ? `제${m[1]}` : null;
}

function extractSearchQueries(userText) {
  const t = (userText || "").trim();
  const queries = [];
  if (t.length >= 2) queries.push(t.slice(0, 80));

  const tokens = t
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 20 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);

  for (const w of tokens) {
    if (!queries.includes(w)) queries.push(w);
  }

  return queries.slice(0, 8);
}

function normalizeLawRows(data) {
  const root = data?.LawSearch || data?.lawSearch;
  const raw = root?.law;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function rowToLawHit(row) {
  const name = (row.법령명한글 || row.법령명 || "").trim();
  if (!name || isNoiseLaw(name)) return null;
  if (/시행령|시행규칙|규칙$|고시$/.test(name) && !/^.{1,12}$/.test(name)) {
    return null;
  }
  const mst = String(row.법령일련번호 || row.MST || "").trim();
  if (!mst) return null;
  return {
    name,
    mst,
    lawId: row.법령ID,
    lawType: row.법종구분?.content || row.법종구분 || "법령"
  };
}

function joNumFromApi(num) {
  const n = parseInt(String(num), 10);
  return Number.isFinite(n) && n > 0 ? `제${n}조` : "관련 조문";
}

function parseAiSearchRows(data) {
  const root = data?.aiSearch;
  const raw = root?.법령조문;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((row) => {
      const name = (row.법령명 || "").trim();
      if (!name || isNoiseLaw(name)) return null;
      const mst = String(row.법령일련번호 || "").trim();
      if (!mst) return null;
      const jo = joNumFromApi(row.조문번호);
      const subtitle = row.조문제목 ? String(row.조문제목).trim() : "";
      const clauseLabel = subtitle ? `${jo}(${subtitle})` : jo;
      const body = String(row.조문내용 || "").trim();
      if (!body) return null;
      return {
        name,
        mst,
        clause: clauseLabel,
        relevance: subtitle || jo,
        core: subtitle || jo,
        desc: body.replace(/\[.*?\]/g, "").slice(0, 400),
        link: `https://www.law.go.kr/법령/${encodeURIComponent(name)}/${jo}`,
        _source: "aiSearch"
      };
    })
    .filter(Boolean);
}

async function fetchAiArticleSearch(query) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "aiSearch",
    type: "JSON",
    search: "0",
    query: query.slice(0, 80),
    display: "10"
  });
  const res = await fetch(`${BASE}/lawSearch.do?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`aiSearch HTTP ${res.status}`);
  const data = await res.json();
  return parseAiSearchRows(data);
}

async function fetchLawSearch(query) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "law",
    type: "JSON",
    query: query.slice(0, 80),
    display: "15"
  });
  const res = await fetch(`${BASE}/lawSearch.do?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`lawSearch HTTP ${res.status}`);
  const data = await res.json();
  return normalizeLawRows(data)
    .map(rowToLawHit)
    .filter(Boolean);
}

function scoreLawHit(hit, userText) {
  const t = userText.toLowerCase();
  const name = hit.name;
  let score = 0;
  if (t.includes(name)) score += 50;
  if (name.length <= 12) score += 5;
  if (hit.lawType === "법률" || hit.lawType?.includes?.("법률")) score += 10;
  if (/시행령|시행규칙/.test(name)) score -= 20;
  return score;
}

function flattenArticleUnit(unit) {
  if (!unit) return "";
  const parts = [];
  if (unit.조문내용) parts.push(String(unit.조문내용).trim());
  const hang = unit.항;
  const hangList = Array.isArray(hang) ? hang : hang ? [hang] : [];
  for (const h of hangList) {
    if (h.항내용) parts.push(String(h.항내용).trim());
  }
  return parts.join("\n");
}

function formatUnitAsHit(lawName, mst, unit) {
  const title = unit.조문내용
    ? String(unit.조문내용).split("\n")[0].trim()
    : `제${unit.조문번호}조`;
  const subtitle = unit.조문제목 ? String(unit.조문제목).trim() : "";
  const clauseLabel = subtitle
    ? `${title} ${subtitle}`.replace(/\s+/g, " ")
    : title;
  const body = flattenArticleUnit(unit);
  const paren = clauseLabel.match(/\(([^)]+)\)/);
  const jo = `제${unit.조문번호}조`;
  return {
    name: lawName,
    mst,
    clause: clauseLabel,
    relevance: paren ? paren[1] : jo,
    core: paren ? paren[1] : jo,
    desc: body.split("\n").find((l) => l.length > 15) || body.slice(0, 220),
    link: `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${jo}`
  };
}

async function findArticleByKeywords(mst, lawName, keywords) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "law",
    type: "JSON",
    MST: String(mst)
  });
  const res = await fetch(`${BASE}/lawService.do?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const units = data?.법령?.조문?.조문단위;
  const list = Array.isArray(units) ? units : units ? [units] : [];
  const kws = keywords.filter((k) => k.length >= 2);

  for (const kw of kws) {
    for (const unit of list) {
      const blob = flattenArticleUnit(unit);
      if (blob.includes(kw)) {
        return formatUnitAsHit(lawName, mst, unit);
      }
    }
  }
  return null;
}

async function resolveArticleForLaw(law, userText, explicitJo) {
  const jo = explicitJo || extractJoFromText(userText);
  if (jo) {
    try {
      const parsed = await getArticleText(law.mst, jo);
      if (parsed) {
        return {
          name: law.name,
          mst: law.mst,
          clause: parsed.clauseLabel,
          relevance: parsed.relevance,
          core: parsed.relevance,
          desc: parsed.snippet,
          link: `https://www.law.go.kr/법령/${encodeURIComponent(law.name)}/${jo}`
        };
      }
    } catch {
      /* fall through */
    }
  }

  const keywords = extractSearchQueries(userText).filter((q) => q.length <= 15);
  return findArticleByKeywords(law.mst, law.name, keywords);
}

/**
 * @returns {Promise<{ hits: object[], queries: string[] }>}
 */
function trimParticle(token) {
  return String(token).replace(/(입니다|했어요|아닌가요|습니다|해요|을|를|가|이|은|는|에|의|로|고|서|다|요|죠)$/u, "");
}

function situationTokens(userText) {
  const out = new Set();
  for (const q of extractSearchQueries(userText).filter(
    (x) => x.length >= 3 && x.length <= 15
  )) {
    out.add(q);
    const stem = trimParticle(q);
    if (stem.length >= 2) out.add(stem);
  }
  return [...out];
}

function blobMatchesToken(blob, token) {
  const core = trimParticle(token);
  if (!core) return false;
  return blob.includes(token) || blob.includes(core);
}

function scoreArticleHit(hit, userText, tokens) {
  const t = userText.toLowerCase();
  let score = 0;
  if (t.includes(hit.name)) score += 20;
  if (/시행령|시행규칙/.test(hit.name)) score -= 25;
  const blob = `${hit.clause} ${hit.desc}`;
  let tokenHits = 0;
  for (const w of tokens) {
    if (blobMatchesToken(blob, w)) {
      tokenHits += 1;
      score += w.length >= 4 ? 12 : 4;
    }
  }
  if (tokenHits === 0 && !t.includes(hit.name)) score -= 40;
  return score;
}

function isRelevantArticleHit(hit, userText, tokens) {
  if (userText.includes(hit.name)) return true;
  const clause = hit.clause || "";
  const desc = hit.desc || "";
  return tokens.filter((w) => w.length >= 3).some((w) => {
    if (/[을를]$/.test(w)) {
      const stem = trimParticle(w);
      return stem.length >= 2 && clause.includes(stem);
    }
    return clause.includes(w) || desc.includes(w);
  });
}

async function searchSituationViaNetwork(userText) {
  const queries = extractSearchQueries(userText);
  const tokens = situationTokens(userText);
  const explicitJo = extractJoFromText(userText);
  let hits = [];

  const shortTerms = queries
    .map(trimParticle)
    .filter((c) => c.length >= 2 && c.length <= 3);
  const aiQueries = [
    ...queries.filter((q) => trimParticle(q).length >= 4),
    ...queries.filter((q) => trimParticle(q).length < 4),
    ...shortTerms
  ].filter((q, i, arr) => arr.indexOf(q) === i);

  for (const q of aiQueries) {
    try {
      const raw = await fetchAiArticleSearch(q);
      const batch = raw.filter((h) => isRelevantArticleHit(h, userText, tokens));
      hits = dedupeHits([...hits, ...batch]);
    } catch (err) {
      console.warn("[aiSearch]", q, err.message || err);
    }
    if (hits.length >= 5) break;
  }

  if (hits.length < 5) {
    let laws = [];
    for (const q of queries) {
      try {
        const batch = await fetchLawSearch(q);
        laws = dedupeHits([...laws, ...batch]);
      } catch (err) {
        console.warn("[lawSearch]", q, err.message || err);
      }
    }

    laws = laws
      .map((h) => ({ ...h, _score: scoreLawHit(h, userText) }))
      .filter((h) => h._score > -10)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);

    for (const law of laws) {
      try {
        const row = await resolveArticleForLaw(law, userText, explicitJo);
        if (row?.desc) hits.push(row);
      } catch (err) {
        console.warn("[lawArticle]", law.name, err.message || err);
      }
      if (hits.length >= 5) break;
    }
  }

  hits = hits
    .filter((h) => isRelevantArticleHit(h, userText, tokens))
    .map((h) => ({ ...h, _score: scoreArticleHit(h, userText, tokens) }))
    .filter((h) => h._score > 0)
    .sort((a, b) => b._score - a._score);

  return { hits: dedupeHits(hits).slice(0, 5), queries };
}

module.exports = {
  searchSituationViaNetwork,
  extractSearchQueries,
  situationTokens,
  trimParticle
};
