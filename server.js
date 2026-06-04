/**
 * LawMap dev server
 * - 정적 파일 제공
 * - /api/law/search → korean-law-mcp CLI (LAW_OC 필요, README 방법 4/5)
 * - 법망은 CLI 실패 시에만 fallback
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const {
  parseExactSearchLawHits,
  parseAiLawArticles,
  scenarioSearchQueries,
  rankHitsForSituation,
  dedupeHits
} = require("./lib/parse-korean-law.js");
const { detectPlaybook } = require("./lib/situation-playbooks.js");
const {
  DEFAULT_FALLBACK,
  enrichWithNextAction,
  hasOpenAiKey
} = require("./lib/generate-next-action.js");
const { resolveKoreanLawBin } = require("./lib/korean-law-bin.js");
const {
  useHttpLawApi,
  searchLawExact,
  getArticleText
} = require("./lib/law-go-kr-api.js");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const KOREAN_LAW_BIN = resolveKoreanLawBin(ROOT);

app.use(express.json());

function hasLawOc() {
  return Boolean(process.env.LAW_OC && String(process.env.LAW_OC).trim());
}

function runKoreanLawJson(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(KOREAN_LAW_BIN, ["query", "--json", query], {
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("korean-law timeout (120s)"));
    }, 120000);

    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error(stderr.trim() || `korean-law exit ${code}`));
        return;
      }
      const start = trimmed.indexOf("{");
      if (start < 0) {
        reject(new Error("korean-law: JSON 없음"));
        return;
      }
      try {
        resolve(JSON.parse(trimmed.slice(start)));
      } catch (e) {
        reject(new Error(`korean-law JSON 파싱 실패: ${e.message}`));
      }
    });
  });
}

async function runSearchLaw(query, display = "50") {
  return new Promise((resolve, reject) => {
    const child = spawn(
      KOREAN_LAW_BIN,
      ["search_law", "--query", query, "--display", display],
      { env: process.env }
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("search_law timeout"));
    }, 60000);
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `search_law exit ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function runGetLawArticle(mst, jo) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      KOREAN_LAW_BIN,
      ["get_law_text", "--mst", String(mst), "--jo", jo],
      { env: process.env }
    );
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("get_law_text timeout"));
    }, 45000);
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stdout);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function extractArticleSnippet(body, maxLen = 220) {
  const clean = body
    .replace(/법령명:.*?\n/g, "")
    .replace(/공포일:.*?\n/g, "")
    .replace(/시행일:.*?\n/g, "");
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("💡") && !l.startsWith("[NOT_FOUND]"));
  const bodyLine = lines.find(
    (l) =>
      (l.startsWith("①") || l.startsWith("1.")) &&
      l.length > 20 &&
      !/^제\d+조/.test(l)
  );
  const text = (bodyLine || lines.slice(-1)[0] || "").replace(/\s+/g, " ");
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function parseArticleMeta(body, jo) {
  const titleLine = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(jo) && l.length > jo.length);
  const clauseLabel = titleLine ? titleLine.replace(/\s+/g, " ") : jo;
  const paren = titleLine?.match(/\(([^)]+)\)/);
  const relevance = paren ? paren[1] : jo;
  const snippet = extractArticleSnippet(body);
  return { clauseLabel, relevance, snippet };
}

function buildPlaybookGuide(route, hits) {
  const lines = [
    `【${route.label}】`,
    "아래 조문은 법제처 Open API(korean-law)에서 조회한 원문 요약입니다.",
    "",
    ...hits.map(
      (h, i) =>
        `${i + 1}. ${h.name} — ${h.clause}\n   ${h.desc || h.core || ""}`
    )
  ];
  return lines.join("\n");
}

const DEFAULT_NEXT_ACTION = DEFAULT_FALLBACK;

async function resolveLawByName(lawQuery) {
  if (useHttpLawApi()) {
    return searchLawExact(lawQuery);
  }
  const out = await runSearchLaw(lawQuery, "50");
  let exact = parseExactSearchLawHits(out).find((h) => h.name === lawQuery);
  if (!exact && lawQuery === "민법") {
    const m = out.match(/민법\n\s*-\s*법령ID:\s*(\S+)\s*\n\s*-\s*MST:\s*(\S+)/);
    if (m) exact = { name: "민법", lawId: m[1], mst: m[2] };
  }
  return exact || null;
}

async function fetchPlaybookHits(route) {
  const mstByLaw = {};
  const hits = [];

  for (const art of route.articles) {
    try {
      if (!mstByLaw[art.lawQuery]) {
        mstByLaw[art.lawQuery] = await resolveLawByName(art.lawQuery);
      }
      const law = mstByLaw[art.lawQuery];
      if (!law?.mst) {
        if (art.optional) continue;
        continue;
      }

      if (useHttpLawApi()) {
        const parsed = await getArticleText(law.mst, art.jo);
        if (!parsed) continue;
        hits.push({
          name: law.name,
          clause: parsed.clauseLabel,
          relevance: parsed.relevance,
          core: parsed.relevance,
          desc: parsed.snippet || parsed.clauseLabel,
          link: `https://www.law.go.kr/법령/${encodeURIComponent(law.name)}/${art.jo}`
        });
        continue;
      }

      const body = await runGetLawArticle(law.mst, art.jo);
      if (!body || body.includes("[NOT_FOUND]")) continue;

      const meta = parseArticleMeta(body, art.jo);

      hits.push({
        name: law.name,
        clause: meta.clauseLabel,
        relevance: meta.relevance,
        core: meta.relevance,
        desc: meta.snippet || meta.clauseLabel,
        link: `https://www.law.go.kr/법령/${encodeURIComponent(law.name)}/${art.jo}`
      });
    } catch (err) {
      console.warn("[playbook]", art.lawQuery, art.jo, err.message || err);
    }
  }
  return hits;
}

function hitsToCards(hits, source) {
  return hits.slice(0, 5).map((h, i) => ({
    num: i + 1,
    name: h.name,
    clause: h.clause || "관련 조문",
    relevance: h.relevance || h.lawType || "법령",
    core: h.core || `${h.name} ${h.clause || ""}`.trim(),
    desc:
      h.desc ||
      "법제처 Open API에서 조회한 조문입니다. 원문 링크에서 전문을 확인하세요.",
    link: h.link || `https://www.law.go.kr/법령/${encodeURIComponent(h.name)}`,
    source
  }));
}

async function searchViaKoreanLaw(text, scenario) {
  if (!hasLawOc()) {
    return { ok: false, error: "no_law_oc" };
  }

  // README 권장: 상황별 search_law → get_law_text (playbook)
  const situationRoute = detectPlaybook(text);
  if (situationRoute) {
    const hits = await fetchPlaybookHits(situationRoute);
    if (hits.length > 0) {
      return enrichWithNextAction(
        {
          ok: true,
          source: "korean-law",
          situationLabel: situationRoute.label,
          laws: hitsToCards(hits, "korean-law"),
          guide: buildPlaybookGuide(situationRoute, hits),
          route: {
            tool: "search_law + get_law_text",
            reason: `${situationRoute.label} (법제처 API 조회)`
          }
        },
        text,
        situationRoute.nextAction || DEFAULT_NEXT_ACTION
      );
    }
  }

  let hits = [];
  let guide = "";
  let route = null;

  try {
    const json = await runKoreanLawJson(text);
    route = json.route;
    const raw = [json.result, json.pipelineResult].filter(Boolean).join("\n\n");
    hits = parseAiLawArticles(raw);
    guide = raw;
  } catch {
    /* continue */
  }

  for (const q of scenarioSearchQueries(scenario, text)) {
    try {
      if (useHttpLawApi()) {
        const exact = await searchLawExact(q);
        if (exact) {
          hits = dedupeHits([
            ...hits,
            { name: exact.name, mst: exact.mst, lawId: exact.lawId, lawType: "법령" }
          ]);
        }
      } else {
        const out = await runSearchLaw(q);
        const exact = parseExactSearchLawHits(out);
        hits = dedupeHits([...hits, ...exact]);
      }
    } catch {
      /* next */
    }
  }

  hits = rankHitsForSituation(dedupeHits(hits), text).slice(0, 5);

  if (hits.length > 0) {
    return enrichWithNextAction(
      {
        ok: true,
        source: "korean-law",
        laws: hitsToCards(hits, "korean-law"),
        guide: guide.slice(0, 2500),
        route
      },
      text,
      DEFAULT_NEXT_ACTION
    );
  }

  if (guide) {
    return { ok: false, error: "empty", guide: guide.slice(0, 2500), route };
  }

  return {
    ok: false,
    error: "korean_law_empty",
    detail: "관련 법령을 찾지 못했습니다. 검색어를 바꿔 보세요."
  };
}

async function searchViaBeopmang(text, scenario) {
  const hints = scenarioSearchQueries(scenario, text);
  for (const query of hints) {
    try {
      const url = `https://api.beopmang.org/api/v4/law?action=search&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 503) {
        const h = await fetch("https://api.beopmang.org/health").then((r) => r.json()).catch(() => ({}));
        if (h.error === "service_maintenance") {
          return { ok: false, maintenance: true };
        }
      }
      if (!res.ok) continue;
      const payload = await res.json();
      const items = payload.results || payload.items || payload.laws || payload.data;
      if (!Array.isArray(items) || items.length === 0) continue;
      const laws = items.slice(0, 5).map((item, i) => ({
        num: i + 1,
        name: item.law_name || item.lawName || item.name || "법령",
        clause: item.article || "관련 조문",
        relevance: item.type || "법망 검색",
        core: item.summary || `${item.law_name || item.name} 관련 규정`,
        desc: item.description || "법망 API 검색 결과",
        link: `https://www.law.go.kr/법령/${encodeURIComponent(item.law_name || item.name || "")}`,
        source: "beopmang"
      }));
      return enrichWithNextAction(
        {
          ok: true,
          source: "beopmang",
          laws
        },
        text,
        DEFAULT_NEXT_ACTION
      );
    } catch {
      /* next */
    }
  }
  return { ok: false, maintenance: true };
}

app.get("/api/status", (_req, res) => {
  res.json({
    koreanLaw: {
      cli: !useHttpLawApi(),
      httpApi: useHttpLawApi(),
      lawOc: hasLawOc(),
      remote: "https://korean-law-mcp.fly.dev/mcp?oc=YOUR_KEY"
    },
    openai: hasOpenAiKey(),
    beopmang: "https://api.beopmang.org"
  });
});

app.get("/api/law/search", async (req, res) => {
  const text = String(req.query.text || req.query.q || "").trim();
  const scenario = String(req.query.scenario || "general");
  if (!text) {
    return res.status(400).json({ ok: false, error: "missing_text" });
  }

  const primary = await searchViaKoreanLaw(text, scenario);
  if (primary.ok) {
    return res.json(
      primary.nextAction
        ? primary
        : await enrichWithNextAction(primary, text, DEFAULT_NEXT_ACTION)
    );
  }

  if (primary.error === "no_law_oc") {
    const fallback = await searchViaBeopmang(text, scenario);
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
      guide: primary.guide,
      route: primary.route
    });
  }

  const fallback = await searchViaBeopmang(text, scenario);
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
    guide: primary.guide,
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
        ? "korean-law-mcp: LAW_OC 설정됨 → /api/law/search 사용"
        : "korean-law-mcp: LAW_OC 없음 → .env에 LAW_OC 추가 후 재시작"
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
