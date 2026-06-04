/**
 * 법제처 Open API (DRF) — Vercel 등 CLI 불가 환경용
 * https://open.law.go.kr
 */

const BASE = "https://www.law.go.kr/DRF";

function getOc() {
  const oc = process.env.LAW_OC && String(process.env.LAW_OC).trim();
  if (!oc) throw new Error("LAW_OC 없음");
  return oc;
}

/** 검색은 항상 법제처 HTTP API 사용 (CLI·playbook 미사용) */
function useHttpLawApi() {
  return Boolean(process.env.LAW_OC && String(process.env.LAW_OC).trim());
}

function joToApiParam(jo) {
  const m = String(jo).match(/제\s*0*(\d+)조/);
  if (!m) return null;
  return String(m[1]).padStart(4, "0");
}

function flattenArticleText(unit) {
  if (!unit) return "";
  const parts = [];
  if (unit.조문내용) parts.push(String(unit.조문내용).trim());
  const hang = unit.항;
  const hangList = Array.isArray(hang) ? hang : hang ? [hang] : [];
  for (const h of hangList) {
    if (h.항내용) parts.push(String(h.항내용).trim());
    const ho = h.호;
    const hoList = Array.isArray(ho) ? ho : ho ? [ho] : [];
    for (const item of hoList) {
      if (item.호내용) parts.push(String(item.호내용).trim());
    }
  }
  return parts.join("\n");
}

async function searchLawExact(lawName) {
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "law",
    type: "JSON",
    query: lawName,
    display: "20"
  });
  const res = await fetch(`${BASE}/lawSearch.do?${params}`);
  if (!res.ok) throw new Error(`lawSearch HTTP ${res.status}`);
  const data = await res.json();
  const raw = data?.LawSearch?.law;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const exact = list.find(
    (l) => (l.법령명한글 || l.법령명 || "").trim() === lawName
  );
  if (!exact) return null;
  return {
    name: lawName,
    lawId: exact.법령ID,
    mst: String(exact.법령일련번호 || exact.MST || "")
  };
}

async function getArticleText(mst, jo) {
  const joParam = joToApiParam(jo);
  if (!joParam) throw new Error(`조문 형식 오류: ${jo}`);
  const oc = getOc();
  const params = new URLSearchParams({
    OC: oc,
    target: "law",
    type: "JSON",
    MST: String(mst),
    JO: joParam
  });
  const res = await fetch(`${BASE}/lawService.do?${params}`);
  if (!res.ok) throw new Error(`lawService HTTP ${res.status}`);
  const data = await res.json();
  const unit = data?.법령?.조문?.조문단위;
  const article = Array.isArray(unit) ? unit[0] : unit;
  if (!article) return null;

  const title = article.조문내용
    ? String(article.조문내용).split("\n")[0].trim()
    : `제${article.조문번호}조`;
  const subtitle = article.조문제목 ? String(article.조문제목).trim() : "";
  const clauseLabel = subtitle
    ? `${title} ${subtitle}`.replace(/\s+/g, " ").trim()
    : title;
  const body = flattenArticleText(article);
  const paren = clauseLabel.match(/\(([^)]+)\)/);
  const relevance = paren ? paren[1] : `제${article.조문번호}조`;

  const lines = [
    `법령명: (MST ${mst})`,
    clauseLabel,
    body
  ];
  return {
    body: lines.join("\n"),
    clauseLabel,
    relevance,
    snippet: body.split("\n").find((l) => l.length > 15) || body.slice(0, 220)
  };
}

module.exports = {
  useHttpLawApi,
  getOc,
  searchLawExact,
  getArticleText,
  joToApiParam
};
