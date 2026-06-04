/**
 * 판례 검색 — 법제처 Open API target=prec (lawSearch + lawService)
 */
const { getOc } = require("./law-go-kr-api.js");
const {
  extractSearchQueries,
  situationTokens,
  trimParticle
} = require("./law-search-network.js");

const BASE = "https://www.law.go.kr/DRF";
const PREC_PUBLIC_BASE = "https://www.law.go.kr/precInfoP.do";
const MAX_PRECEDENTS = 3;

function buildPrecPublicUrl(precId) {
  return `${PREC_PUBLIC_BASE}?precSeq=${encodeURIComponent(String(precId))}`;
}
const MAX_DETAIL_FETCH = 4;

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
    _listScore: court.includes("대법원") ? 20 : 0
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

function inferPrecLawRef(userText) {
  const t = userText || "";
  if (/정당방위|강도|살인|상해|폭행|절도|형법|자기방어/.test(t)) return "형법";
  if (/해고|임금|근로|퇴직|노동/.test(t)) return "근로기준법";
  if (/임대|전세|월세|보증금|집주인/.test(t)) return "주택임대차보호법";
  if (/환불|소비자|전자상거래/.test(t)) return "전자상거래";
  return "";
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

function scorePrecHit(hit, userText, tokens) {
  let score = hit._listScore || 0;
  const blob = `${hit.caseName} ${hit.court} ${hit.holding || ""} ${hit.gist || ""} ${hit.caseFacts || ""}`;
  for (const w of tokens.filter((t) => t.length >= 3)) {
    if (blob.includes(w)) score += w.length >= 4 ? 15 : 5;
  }
  if (userText.includes("정당방위") && hit.caseName.includes("정당방위")) score += 30;
  if (/해고|해직/.test(userText) && /해고|근로/.test(hit.caseName)) score += 15;
  if (/임금|체불/.test(userText) && /임금|체불/.test(hit.caseName)) score += 12;
  return score;
}

function isRelevantPrec(hit, userText, tokens) {
  if (hit.caseFacts || hit.judgmentOrder) return true;
  if (hit.holding || hit.gist) {
    const blob = `${hit.caseName} ${hit.holding} ${hit.gist}`;
    if (inferPrecBoostQueries(userText).some((q) => blob.includes(q))) return true;
  }
  const blob = `${hit.caseName} ${hit.holding || ""} ${hit.gist || ""}`;
  if (tokens.filter((w) => w.length >= 3).some((w) => blob.includes(w))) return true;
  if (/해고|해직/.test(userText) && /해고|근로|부당/.test(hit.caseName)) return true;
  if (/정당방위|자기방어/.test(userText) && /정당방위/.test(blob)) return true;
  if (/임금|체불|월급/.test(userText) && /임금|체불|퇴직/.test(blob)) return true;
  return false;
}

/**
 * @returns {Promise<{ precedents: object[], queries: string[] }>}
 */
function inferPrecBoostQueries(userText) {
  const t = userText || "";
  const boost = [];
  if (/해고|해직|권고사직|계약해지/.test(t)) boost.push("부당해고", "해고");
  if (/정당방위|자기방어/.test(t)) boost.push("정당방위");
  if (/임금|체불|월급|퇴직금/.test(t)) boost.push("임금", "임금체불");
  if (/임대|전세|월세|보증금|집주인/.test(t)) boost.push("임대차", "전세");
  if (/환불|반품|소비자/.test(t)) boost.push("환불", "소비자");
  if (/괴롭|직장내|폭언/.test(t)) boost.push("직장내괴롭힘", "괴롭힘");
  if (/강도|절도|폭행|상해/.test(t)) boost.push("정당방위", "상해");
  return boost;
}

async function searchPrecedentsViaNetwork(userText) {
  const boost = inferPrecBoostQueries(userText);
  const queries = [
    ...boost,
    ...extractSearchQueries(userText).filter(
      (q) => trimParticle(q).length >= 3 && q.length <= 24
    )
  ]
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, 6);
  const tokens = situationTokens(userText);
  const lawRef = inferPrecLawRef(userText);
  const searchExtra = { org: "400201", JO: lawRef || undefined };
  let listed = [];
  let listQueries = [];

  const runSearch = async (q, mode) => {
    const batch = await fetchPrecSearch(q, mode, searchExtra);
    if (batch.length) listQueries.push(`${q}(search=${mode})`);
    return batch;
  };

  for (const q of boost.length ? boost : queries.slice(0, 3)) {
    try {
      listed = dedupePrecs([...listed, ...(await runSearch(q, 1))]);
    } catch (err) {
      console.warn("[precSearch:title]", q, err.message || err);
    }
    if (listed.length >= 10) break;
  }

  if (listed.length < 4) {
    for (const q of queries) {
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
      listed = dedupePrecs([...listed, ...(await runSearch(lawRef, 2))]);
      listQueries.push(`${lawRef}(JO+본문)`);
    } catch (err) {
      console.warn("[precSearch:JO]", err.message || err);
    }
  }

  listed = listed
    .map((h) => ({ ...h, _score: scorePrecHit(h, userText, tokens) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, MAX_DETAIL_FETCH + 2);

  const detailed = [];

  for (const item of listed) {
    if (detailed.length >= MAX_DETAIL_FETCH) break;
    try {
      const full = await fetchPrecDetail(item.precId);
      if (!full) continue;
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
      if (isRelevantPrec(merged, userText, tokens)) {
        detailed.push(merged);
      }
    } catch (err) {
      console.warn("[precService]", item.precId, err.message || err);
    }
  }

  if (detailed.length < MAX_PRECEDENTS && listed.length > 0) {
    for (const item of listed) {
      if (detailed.length >= MAX_PRECEDENTS) break;
      if (detailed.some((d) => d.precId === item.precId)) continue;
      try {
        const full = await fetchPrecDetail(item.precId);
        if (!full) continue;
        detailed.push({
          ...item,
          ...full,
          caseNo: item.caseNo || full.caseNo,
          caseFacts:
            full.caseFacts ||
            full.gist?.slice(0, 500) ||
            `${item.caseName} (${item.court})`
        });
      } catch {
        /* skip */
      }
    }
  }

  const precedents = detailed
    .map((h) => ({ ...h, _score: scorePrecHit(h, userText, tokens) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, MAX_PRECEDENTS);

  return {
    precedents,
    queries: [...new Set([...listQueries, ...queries])],
    listCount: listed.length
  };
}

module.exports = {
  searchPrecedentsViaNetwork,
  fetchPrecDetail,
  stripHtml
};
