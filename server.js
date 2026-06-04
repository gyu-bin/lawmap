/**
 * LawMap dev server
 * - 정적 파일 제공
 * - /api/law/search → 법제처 Open API(DRF) 네트워크 조회 + OpenAI(지금 할 일)
 * - LAW_OC 없을 때만 법망 fallback
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const {
  DEFAULT_FALLBACK,
  enrichWithNextAction,
  hasOpenAiKey
} = require("./lib/generate-next-action.js");
const { useHttpLawApi } = require("./lib/law-go-kr-api.js");
const { searchSituationViaNetwork } = require("./lib/law-search-network.js");
const { searchPrecedentsViaNetwork } = require("./lib/prec-search-network.js");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

app.use(express.json());

function hasLawOc() {
  return Boolean(process.env.LAW_OC && String(process.env.LAW_OC).trim());
}

function hitsToCards(hits, source) {
  return hits.slice(0, 5).map((h, i) => ({
    kind: "law",
    num: i + 1,
    name: h.name,
    clause: h.clause || "관련 조문",
    relevance: h.relevance || h.lawType || "법령",
    core: h.core || `${h.name} ${h.clause || ""}`.trim(),
    desc: h.desc || "",
    link: h.link || `https://www.law.go.kr/법령/${encodeURIComponent(h.name)}`,
    source
  }));
}

function precsToCards(precs) {
  return precs.slice(0, 3).map((p, i) => {
    const holding = p.holding || "";
    const gist = p.gist || "";
    const caseFacts = p.caseFacts || "";
    const judgmentOrder = p.judgmentOrder || "";
    const courtAnalysis = p.courtAnalysis || "";
    return {
      kind: "prec",
      num: i + 1,
      name: p.caseName,
      clause: [p.court, p.caseNo, p.date].filter(Boolean).join(" · ") || "판례",
      relevance: p.verdictType || "판례",
      core: judgmentOrder || holding || p.caseName,
      holding,
      gist,
      caseFacts,
      judgmentOrder,
      courtAnalysis,
      refLaws: p.refLaws || "",
      refCases: p.refCases || "",
      link:
        p.link ||
        `https://www.law.go.kr/precInfoP.do?precSeq=${encodeURIComponent(p.precId)}`,
      source: "korean-law-prec"
    };
  });
}

/** 결과 페이지용 한 줄~몇 줄 핵심만 (법령·판례 카드와 중복 나열하지 않음) */
function buildKeySummary(hits, precedents) {
  const lines = [];
  if (hits?.length) {
    const top = hits.slice(0, 3).map((h) => `${h.name} ${h.clause || ""}`.trim());
    lines.push(`법령 ${hits.length}건 — ${top.join(" · ")}`);
  }
  if (precedents?.length) {
    const top = precedents.slice(0, 2).map((p) => {
      const title = p.caseName || p.name;
      const court =
        p.court || (p.clause && String(p.clause).split("·")[0]?.trim());
      return [title, court].filter(Boolean).join(" ");
    });
    lines.push(`판례 ${precedents.length}건 — ${top.join(" · ")}`);
  }
  return lines.join("\n");
}

const DEFAULT_NEXT_ACTION = DEFAULT_FALLBACK;

async function searchViaKoreanLaw(text) {
  if (!hasLawOc()) {
    return { ok: false, error: "no_law_oc" };
  }

  const [{ hits, queries }, precResult] = await Promise.all([
    searchSituationViaNetwork(text),
    searchPrecedentsViaNetwork(text).catch((err) => {
      console.warn("[precSearch]", err.message || err);
      return { precedents: [], queries: [], listCount: 0 };
    })
  ]);
  const { precedents, queries: precQueries, listCount: precListCount } =
    precResult;

  if (hits.length > 0 || precedents.length > 0) {
    return enrichWithNextAction(
      {
        ok: true,
        source: "korean-law",
        laws: hitsToCards(hits, "korean-law"),
        precedents: precsToCards(precedents),
        precListCount,
        precQueries,
        keySummary: buildKeySummary(hits, precedents),
        route: {
          tool: "law.go.kr/DRF (aiSearch + lawSearch + lawService + prec)",
          reason: "상황 문장 기반 실시간 네트워크 조회(법령·판례)"
        }
      },
      text,
      DEFAULT_NEXT_ACTION
    );
  }

  return {
    ok: false,
    error: "korean_law_empty",
    detail: "법제처 API에서 관련 법령·조문을 찾지 못했습니다. 상황을 더 구체적으로 적어 보세요."
  };
}

async function searchViaBeopmang(text) {
  const query = text.trim().slice(0, 80);
  if (!query) return { ok: false, maintenance: true };

  try {
    const url = `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 503) {
      const h = await fetch("https://api.beopmang.org/health")
        .then((r) => r.json())
        .catch(() => ({}));
      if (h.error === "service_maintenance") {
        return { ok: false, maintenance: true };
      }
    }
    if (!res.ok) return { ok: false, maintenance: true };
    const payload = await res.json();
    const items = payload.results || payload.items || payload.laws || payload.data;
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, empty: true };
    }
    const laws = items.slice(0, 5).map((item, i) => ({
      num: i + 1,
      name: item.law_name || item.lawName || item.name || "법령",
      clause: item.article || "관련 조문",
      relevance: item.type || "법망 검색",
      core: item.summary || `${item.law_name || item.name} 관련 규정`,
      desc: item.description || "",
      link: `https://www.law.go.kr/법령/${encodeURIComponent(item.law_name || item.name || "")}`,
      source: "beopmang"
    }));
    return enrichWithNextAction(
      {
        ok: true,
        source: "beopmang",
        laws,
        keySummary: buildKeySummary(
          laws.map((l) => ({ name: l.name, clause: l.clause })),
          []
        )
      },
      text,
      DEFAULT_NEXT_ACTION
    );
  } catch {
    return { ok: false, maintenance: true };
  }
}

app.get("/api/status", (_req, res) => {
  res.json({
    koreanLaw: {
      httpApi: useHttpLawApi(),
      lawOc: hasLawOc(),
      endpoint: "https://www.law.go.kr/DRF (lawSearch + lawService)"
    },
    openai: hasOpenAiKey(),
    beopmang: "https://api.beopmang.org"
  });
});

app.get("/api/law/search", async (req, res) => {
  const text = String(req.query.text || req.query.q || "").trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: "missing_text" });
  }

  const primary = await searchViaKoreanLaw(text);
  if (primary.ok) {
    return res.json(
      primary.nextAction
        ? primary
        : await enrichWithNextAction(primary, text, DEFAULT_NEXT_ACTION)
    );
  }

  if (primary.error === "no_law_oc") {
    const fallback = await searchViaBeopmang(text);
    if (fallback.ok) {
      return res.json(
        fallback.nextAction
          ? fallback
          : await enrichWithNextAction(fallback, text, DEFAULT_NEXT_ACTION)
      );
    }
    return res.status(503).json({
      ok: false,
      error: "no_law_oc",
      message:
        "프로젝트 루트 .env에 LAW_OC(법제처 Open API 키)를 넣고 서버를 재시작하세요. 발급: https://open.law.go.kr",
      beopmang: fallback.maintenance ? "maintenance" : "unavailable"
    });
  }

  // LAW_OC 있으면 법망 점검과 무관하게 korean-law 실패만 안내 (법망 maintenance 오표시 방지)
  if (hasLawOc()) {
    return res.status(200).json({
      ok: false,
      error: primary.error || "empty",
      koreanLawFailed: true,
      detail: primary.detail,
      route: primary.route
    });
  }

  const fallback = await searchViaBeopmang(text);
  if (fallback.ok) {
    return res.json(
      fallback.nextAction
        ? fallback
        : await enrichWithNextAction(fallback, text, DEFAULT_NEXT_ACTION)
    );
  }

  res.status(503).json({
    ok: false,
    error: primary.error || "unavailable",
    maintenance: Boolean(fallback.maintenance),
    detail: primary.detail,
    route: primary.route
  });
});

app.use(express.static(ROOT));

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`LawMap http://localhost:${PORT}`);
    console.log(
      hasLawOc()
        ? "법제처 API: LAW_OC 설정됨 → /api/law/search"
        : "법제처 API: LAW_OC 없음 → .env에 LAW_OC 추가 후 재시작"
    );
    console.log(
      hasOpenAiKey()
        ? "OpenAI: OPENAI_API_KEY 설정됨 → 지금 할 일 생성"
        : "OpenAI: OPENAI_API_KEY 없음 → 지금 할 일은 기본 문구 fallback"
    );
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `포트 ${PORT}이(가) 이미 사용 중입니다. 기존 프로세스 종료:\n  lsof -ti:${PORT} | xargs kill -9\n그다음 npm run dev`
      );
      process.exit(1);
    }
    throw err;
  });
}
