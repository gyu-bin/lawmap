/**
 * 판례 검색 — 법제처 Open API target=prec (lawSearch + lawService)
 */
const { getOc } = require("./law-go-kr-api.js");
const { matchesSearchQuery } = require("./law-search-network.js");
const { rankPrecedentsBySituation, shouldHardExclude } = require("./rank-precedents.js");
const {
  isWorkplaceSituation,
  workplaceContextScore,
  isPureCriminalDefamation,
  precTextBlob,
  countKeywordHits
} = require("./prec-context.js");

const BASE = "https://www.law.go.kr/DRF";
const PREC_PUBLIC_BASE = "https://www.law.go.kr/precInfoP.do";
const MAX_PRECEDENTS = 3;

function buildPrecPublicUrl(precId) {
  return `${PREC_PUBLIC_BASE}?precSeq=${encodeURIComponent(String(precId))}`;
}
const MAX_DETAIL_FETCH = 8;

function stripHtml(html, { preserveLines = false } = {}) {
  let s = String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  if (preserveLines) {
    return s
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

/** 판례내용에서 사건·주문(결과)·법원 판단 구간 추출 */
function parsePrecBody(html) {
  const text = stripHtml(html, { preserveLines: true });
  if (!text) return { caseFacts: "", judgmentOrder: "", courtAnalysis: "" };

  const judgmentOrder = (() => {
    const m = text.match(/【\s*주\s*문\s*】\s*([\s\S]*?)(?=【\s*이\s*유\s*】|$)/i);
    return m ? m[1].trim() : "";
  })();

  let caseFacts = "";
  const factPatterns = [
    /공소사실\s*요지는[,\s]*([\s\S]*?)\s*(?=원심은|원심이|【|$)/i,
    /범죄사실\s*요지[:\s]*([\s\S]*?)\s*(?=원심|【|$)/i,
    /사실\s*요지[:\s]*([\s\S]*?)\s*(?=원심|【\s*주\s*문\s*】|판\s*결\s*이유|$)/i,
    /【\s*이\s*유\s*】\s*([\s\S]*?)(?=나\.\s*대법원의\s*판단|【|$)/i
  ];
  for (const re of factPatterns) {
    const m = text.match(re);
    if (m && m[1].trim().length > 40) {
      caseFacts = m[1].trim();
      break;
    }
  }

  let courtAnalysis = "";
  const analysisM = text.match(/(?:나\.\s*)?대법원의\s*판단\s*([\s\S]*)/i);
  if (analysisM) {
    courtAnalysis = analysisM[1].trim();
  } else {
    const reasonM = text.match(/【\s*이\s*유\s*】\s*([\s\S]*?)$/i);
    if (reasonM) courtAnalysis = reasonM[1].trim();
  }

  return { caseFacts, judgmentOrder, courtAnalysis };
}

function normalizePrecRows(data) {
  const root = data?.PrecSearch;
  const raw = root?.prec;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function formatPrecDate(raw) {
  const s = String(raw || "").trim();
  if (s.length === 8 && /^\d+$/.test(s)) {
    return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  }
  return s;
}

function rowToPrecListItem(row) {
  const precId = String(row.판례일련번호 || "").trim();
  if (!precId) return null;
  const caseName = String(row.사건명 || "판례").trim();
  const court = String(row.법원명 || "").trim();
  const caseNo = String(row.사건번호 || "").trim();
  const date = formatPrecDate(row.선고일자);
  const verdictType = String(row.판결유형 || row.선고 || "판례").trim();
  return {
    precId,
    caseName,
    court,
    caseNo,
    date,
    verdictType,
    caseType: row.사건종류명 || "",
    _listScore: 0
  };
}

function dedupePrecs(list) {
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.precId)) return false;
    seen.add(p.precId);
    return true;
  });
}

function precBlob(hit) {
  return `${hit.caseName} ${hit.court} ${hit.holding || ""} ${hit.gist || ""} ${hit.caseFacts || ""} ${hit.refLaws || ""}`;
}

function scorePrecHit(hit, searchQueries, analysis = {}) {
  let score = 0;
  const blob = precBlob(hit);
  const title = hit.caseName || "";

  for (const kw of analysis.precSituationKeywords || []) {
    if (kw.length < 2) continue;
    if (blob.includes(kw) || title.includes(kw)) score += 32;
    else if (blob.includes(kw.slice(0, Math.min(kw.length, 4)))) score += 8;
  }

  for (const q of searchQueries) {
    if (matchesSearchQuery(blob, q)) score += 22;
    else if (q.split(/\s+/).some((p) => p.length >= 2 && blob.includes(p))) score += 9;
  }

  for (const neg of analysis.precNegativeSignals || []) {
    if (neg.length < 2) continue;
    if (title.includes(neg) || blob.includes(neg)) score -= 40;
  }

  if (isWorkplaceSituation(analysis)) {
    score += workplaceContextScore(blob) * 14;
    if (isPureCriminalDefamation(title, blob)) score -= 35;
    if (/부당노동|해고무효|부당해고/.test(title + blob)) score += 18;
  }

  return score;
}

function isRelevantPrec(hit, searchQueries, analysis = {}) {
  const blob = precBlob(hit);
  const title = hit.caseName || "";
  const score = scorePrecHit(hit, searchQueries, analysis);
  const keywordHits = countKeywordHits(blob, title, analysis.precSituationKeywords || []);

  if (score < 12) return false;
  if (isWorkplaceSituation(analysis) && isPureCriminalDefamation(title, blob)) {
    return workplaceContextScore(blob) >= 1;
  }

  const minScoreWithoutKeyword = isWorkplaceSituation(analysis)
    ? workplaceContextScore(blob) >= 1
      ? 18
      : 24
    : 38;

  if (keywordHits === 0 && score < minScoreWithoutKeyword) return false;
  return true;
}

async function mergePrecDetail(item, searchQueries, analysis) {
  const full = await fetchPrecDetail(item.precId);
  if (!full) return null;

  let caseFacts = full.caseFacts;
  if (!caseFacts && full.courtAnalysis) {
    caseFacts = full.courtAnalysis.slice(0, 1500);
  }
  if (!caseFacts) {
    caseFacts = `검색된 판례: ${item.caseName} (${item.court} ${item.caseNo})`;
  }

  const merged = {
    ...item,
    ...full,
    caseNo: item.caseNo || full.caseNo,
    caseFacts,
    listTitle: item.caseName
  };

  if (shouldHardExclude(merged, analysis)) return null;

  const hitScore = scorePrecHit(merged, searchQueries, analysis);
  return { merged, hitScore };
}

async function fetchPrecSearch(query, searchMode, extra = {}) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "prec",
    type: "JSON",
    search: String(searchMode),
    query: query.slice(0, 80),
    display: "15",
    sort: "ddes"
  });
  if (extra.org) params.set("org", extra.org);
  if (extra.curt) params.set("curt", extra.curt);
  if (extra.JO) params.set("JO", extra.JO);
  const res = await fetch(`${BASE}/lawSearch.do?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`precSearch HTTP ${res.status}`);
  const data = await res.json();
  return normalizePrecRows(data).map(rowToPrecListItem).filter(Boolean);
}

async function fetchPrecDetail(precId) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "prec",
    type: "JSON",
    ID: String(precId)
  });
  const res = await fetch(`${BASE}/lawService.do?${params}`, {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error(`precService HTTP ${res.status}`);
  const data = await res.json();
  const svc = data?.PrecService;
  if (!svc) return null;

  const holding = stripHtml(svc.판시사항, { preserveLines: true });
  const gist = stripHtml(svc.판결요지, { preserveLines: true });
  const { caseFacts, judgmentOrder, courtAnalysis } = parsePrecBody(
    svc.판례내용
  );
  const caseNo = stripHtml(svc.사건번호);
  const verdictType = stripHtml(svc.판결유형 || svc.선고) || "판례";

  return {
    precId: String(precId),
    caseName: stripHtml(svc.사건명) || "판례",
    court: stripHtml(svc.법원명) || "",
    caseNo,
    date: formatPrecDate(svc.선고일자),
    verdictType,
    caseType: stripHtml(svc.사건종류명) || "",
    holding,
    gist,
    caseFacts,
    judgmentOrder,
    courtAnalysis,
    refCases: stripHtml(svc.참조판례, { preserveLines: true }),
    refLaws: stripHtml(svc.참조조문, { preserveLines: true }),
    link: buildPrecPublicUrl(precId)
  };
}

function expandPrecQueries(analysis) {
  const seen = new Set();
  const out = [];
  const add = (q) => {
    const s = String(q).trim().slice(0, 80);
    if (s.length >= 2 && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };

  for (const q of analysis.precSearchQueries || []) add(q);

  const kws = analysis.precSituationKeywords || [];
  if (kws.length >= 2) add(kws.slice(0, 3).join(" "));

  const kwBlob = `${kws.join(" ")} ${analysis.label || ""} ${analysis.situationSummary || ""}`;
  const workplace =
    analysis.precDomain === "workplace" ||
    /괴롭힘|직장|상사|모욕|명예|퇴근|근로|해고|폭언/.test(kwBlob);

  if (workplace) {
    add("부당노동행위 모욕");
    add("부당노동행위 폭언");
    add("과중한 업무 부당노동");
    add("해고무효 괴롭힘");
    add("부당해고 직장내괴롭힘");
    add("직장 모욕 상사");
    add("손해배상 직장 괴롭힘");
  }

  return out.slice(0, 10);
}

async function searchPrecedentsViaNetwork(userText, analysis = {}) {
  const searchQueries = expandPrecQueries(analysis);
  if (!searchQueries.length) {
    return {
      precedents: [],
      queries: [],
      listCount: 0,
      skipReason: "ai_skip",
      skipGuidance: analysis.precSkipGuidance
    };
  }

  const lawRef = analysis.precLawRef || "";
  let listed = [];
  let listQueries = [];

  const runSearch = async (q, mode, { withJo = false } = {}) => {
    const extra = { org: "400201" };
    if (withJo && lawRef) extra.JO = lawRef;
    const batch = await fetchPrecSearch(q, mode, extra);
    if (batch.length) listQueries.push(`${q}(search=${mode}${withJo && lawRef ? "+JO" : ""})`);
    return batch;
  };

  for (const q of searchQueries) {
    try {
      listed = dedupePrecs([...listed, ...(await runSearch(q, 1))]);
    } catch (err) {
      console.warn("[precSearch:title]", q, err.message || err);
    }
    if (listed.length >= 10) break;
  }

  if (listed.length < 4) {
    for (const q of searchQueries) {
      try {
        listed = dedupePrecs([...listed, ...(await runSearch(q, 2))]);
      } catch (err) {
        console.warn("[precSearch:body]", q, err.message || err);
      }
      if (listed.length >= 10) break;
    }
  }

  if (listed.length < 2 && lawRef) {
    try {
      listed = dedupePrecs([...listed, ...(await runSearch(lawRef, 2, { withJo: true }))]);
    } catch (err) {
      console.warn("[precSearch:JO]", err.message || err);
    }
  }

  listed = listed
    .map((h) => ({ ...h, _score: scorePrecHit(h, searchQueries, analysis) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, MAX_DETAIL_FETCH + 2);

  const detailed = [];
  const seenDetail = new Set();
  const smallPool = listed.length <= MAX_PRECEDENTS;

  const pushDetail = (merged, hitScore, { relaxed = false } = {}) => {
    if (!merged || seenDetail.has(merged.precId)) return;
    if (isRelevantPrec(merged, searchQueries, analysis)) {
      seenDetail.add(merged.precId);
      detailed.push(merged);
      return;
    }
    if ((smallPool || relaxed) && hitScore >= 12) {
      seenDetail.add(merged.precId);
      detailed.push(merged);
    }
  };

  for (const item of listed) {
    if (detailed.length >= MAX_DETAIL_FETCH) break;
    try {
      const row = await mergePrecDetail(item, searchQueries, analysis);
      if (row) pushDetail(row.merged, row.hitScore);
    } catch (err) {
      console.warn("[precService]", item.precId, err.message || err);
    }
  }

  if (detailed.length < 2) {
    for (const item of listed) {
      if (detailed.length >= MAX_DETAIL_FETCH) break;
      try {
        const row = await mergePrecDetail(item, searchQueries, analysis);
        if (row) pushDetail(row.merged, row.hitScore, { relaxed: true });
      } catch (err) {
        console.warn("[precService:relaxed]", item.precId, err.message || err);
      }
    }
  }

  const { precedents: ranked, guidance: rankGuidance, partialMatch } =
    await rankPrecedentsBySituation(userText, analysis, detailed);

  const precedents = ranked.slice(0, MAX_PRECEDENTS).map((p) => ({
    ...p,
    partialMatch: p.partialMatch || partialMatch
  }));

  return {
    precedents,
    precPartialMatch: partialMatch || precedents.some((p) => p.partialMatch),
    queries: [...new Set([...listQueries, ...searchQueries])],
    searchedCount: listed.length,
    listCount: precedents.length,
    skipReason: precedents.length ? undefined : "no_relevant_match",
    skipGuidance: precedents.length
      ? undefined
      : rankGuidance ||
        "직장 내 괴롭힘은 2019년 이후 근로기준법 조문으로 주로 다루며, 법제처 판례 DB에는 '직장 내 괴롭힘' 명칭 사건이 적습니다. 모욕·명예훼손·손해밴상 등 유사 키워드로도 찾아보았으나 일치하는 판례가 없었습니다. 위 법령 조문과 「지금 할 일」을 참고해 주세요."
  };
}

module.exports = {
  searchPrecedentsViaNetwork,
  fetchPrecDetail,
  stripHtml
};
