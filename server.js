/**
 * LawMap dev server — AI 상황 분석 + 법제처 Open API + OpenAI 실무 안내
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const { enrichWithSituationBrief } = require("./lib/generate-situation-brief.js");
const { hasOpenAiKey } = require("./lib/generate-next-action.js");
const { analyzeSituation } = require("./lib/analyze-situation.js");
const { summarizePrecedents } = require("./lib/summarize-precedents.js");
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
  return precs.slice(0, 3).map((p, i) => ({
    kind: "prec",
    num: i + 1,
    name: p.caseName,
    clause: [p.court, p.caseNo, p.date].filter(Boolean).join(" · ") || "판례",
    relevance: p.verdictType || "판례",
    core: p.judgmentOrder || p.holding || p.caseName,
    holding: p.holding || "",
    gist: p.gist || "",
    caseFacts: p.caseFacts || "",
    judgmentOrder: p.judgmentOrder || "",
    courtAnalysis: p.courtAnalysis || "",
    refLaws: p.refLaws || "",
    refCases: p.refCases || "",
    aiSummary: p.aiSummary || "",
    aiRelevance: p.aiRelevance || "",
    relevanceScore: p.relevanceScore,
    relevanceNote: p.relevanceNote || "",
    partialMatch: Boolean(p.partialMatch),
    link:
      p.link ||
      `https://www.law.go.kr/precInfoP.do?precSeq=${encodeURIComponent(p.precId)}`,
    source: "korean-law-prec"
  }));
}

function buildKeySummary(hits, precedents) {
  const lines = [];
  if (hits?.length) {
    const top = hits.slice(0, 3).map((h) => `${h.name} ${h.clause || ""}`.trim());
    lines.push(`법령 ${hits.length}건 — ${top.join(" · ")}`);
  }
  if (precedents?.length) {
    const top = precedents.slice(0, 2).map((p) => {
      const title = p.caseName || p.name;
      const court = p.court || (p.clause && String(p.clause).split("·")[0]?.trim());
      return [title, court].filter(Boolean).join(" ");
    });
    lines.push(`판례 ${precedents.length}건 — ${top.join(" · ")}`);
  }
  return lines.join("\n");
}

async function searchViaKoreanLaw(text) {
  if (!hasLawOc()) {
    return {
      ok: false,
      error: "no_law_oc",
      message:
        ".env에 LAW_OC(법제처 Open API 키)를 설정하세요. 발급: https://open.law.go.kr"
    };
  }

  const analysis = await analyzeSituation(text);
  if (!analysis.ok) {
    return analysis;
  }

  const baseMeta = {
    situationLabel: analysis.label,
    situationSummary: analysis.situationSummary,
    loadingHints: analysis.loadingHints,
    analysisQueries: {
      law: analysis.lawSearchQueries,
      prec: analysis.precSearchQueries
    }
  };

  if (!analysis.legalIntent) {
    return {
      ok: false,
      error: "no_legal_intent",
      ...baseMeta,
      detail:
        analysis.emptyGuidance ||
        analysis.situationSummary ||
        "법적 분쟁·권리 침해 상황을 더 구체적으로 적어 주세요.",
      precSkipReason: "no_legal_intent",
      precSkipGuidance: analysis.precSkipGuidance
    };
  }

  const [{ hits, queries }, precResult] = await Promise.all([
    searchSituationViaNetwork(text, analysis),
    analysis.shouldSearchPrecedents
      ? searchPrecedentsViaNetwork(text, analysis).catch((err) => {
          console.warn("[precSearch]", err.message || err);
          return { precedents: [], queries: [], listCount: 0 };
        })
      : Promise.resolve({
          precedents: [],
          queries: [],
          listCount: 0,
          skipReason: "ai_skip",
          skipGuidance: analysis.precSkipGuidance
        })
  ]);

  const {
    precedents,
    queries: precQueries,
    listCount: precListCount,
    searchedCount: precSearchedCount,
    skipReason: precSkipReason,
    skipGuidance: precSkipGuidance,
    precPartialMatch
  } = precResult;

  if (hits.length > 0 || precedents.length > 0) {
    const laws = hitsToCards(hits, "korean-law");
    const basePayload = {
      ok: true,
      source: "korean-law",
      laws,
      precListCount,
      precSearchedCount,
      precSkipReason,
      precSkipGuidance,
      precPartialMatch,
      precQueries,
      keySummary: buildKeySummary(hits, precedents),
      ...baseMeta,
      route: {
        tool: "OpenAI analyze + law.go.kr/DRF",
        reason: "AI 검색어 생성 후 법령·판례 실시간 조회"
      }
    };

    const summarizedPrecs = precedents.length
      ? await summarizePrecedents(text, precedents)
      : [];
    const precCards = precsToCards(summarizedPrecs.length ? summarizedPrecs : precedents);

    const enriched = await enrichWithSituationBrief(
      { ...basePayload, precedents: precCards },
      text,
      precCards,
      {
        situationLabel: analysis.label,
        situationSummary: analysis.situationSummary
      }
    );

    return {
      ...enriched,
      precListCount,
      precSearchedCount,
      precPartialMatch,
      precedents: precCards
    };
  }

  return {
    ok: false,
    error: "korean_law_empty",
    ...baseMeta,
    detail:
      analysis.emptyGuidance ||
      "법제처 API에서 관련 법령·조문을 찾지 못했습니다. 상황을 더 구체적으로 적어 보세요.",
    precSkipReason,
    precSkipGuidance
  };
}

app.get("/api/status", (_req, res) => {
  res.json({
    koreanLaw: {
      httpApi: useHttpLawApi(),
      lawOc: hasLawOc(),
      endpoint: "https://www.law.go.kr/DRF"
    },
    openai: hasOpenAiKey(),
    mode: "ai-analyze + law.go.kr API only"
  });
});

app.get("/api/law/search", async (req, res) => {
  const text = String(req.query.text || req.query.q || "").trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: "missing_text" });
  }

  const result = await searchViaKoreanLaw(text);
  if (result.ok) {
    return res.json(result);
  }

  const status =
    result.error === "no_law_oc" || result.error === "no_openai_key" ? 503 : 200;
  return res.status(status).json(result);
});

app.use(express.static(ROOT));

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`LawMap http://localhost:${PORT}`);
    console.log(
      hasLawOc()
        ? "법제처 API: LAW_OC 설정됨"
        : "법제처 API: LAW_OC 없음 — .env에 LAW_OC 추가"
    );
    console.log(
      hasOpenAiKey()
        ? "OpenAI: OPENAI_API_KEY 설정됨 — 상황 분석·실무 안내"
        : "OpenAI: OPENAI_API_KEY 없음 — 검색 불가"
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
