/**
 * OpenAI — 사용자 상황 대비 판례 관련성 재랭킹
 */
const { hasOpenAiKey } = require("./generate-next-action.js");
const { adjustScoreForContext, isWorkplaceSituation, isPureCriminalDefamation, countKeywordHits } = require("./prec-context.js");

function extractResponsesText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  for (const item of data?.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text?.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
}

function parseJsonFromModel(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1].trim() : raw);
}

function buildCandidateBlock(p, index) {
  const lines = [`[${index}] ${p.caseName || "판례"}`];
  if (p.court || p.caseNo) lines.push([p.court, p.caseNo].filter(Boolean).join(" · "));
  const facts = (p.caseFacts || p.gist || p.holding || "").slice(0, 500);
  if (facts) lines.push(facts);
  return lines.join("\n");
}

const MIN_RELEVANCE_SCORE = 42;
const MIN_PARTIAL_SCORE = 32;
const MIN_LAST_RESORT_SCORE = 28;
const MAX_DISPLAY = 3;

function fillSmallPool(displayed, list, analysis, applyScore, byIndex) {
  if (list.length > MAX_DISPLAY) return { precedents: displayed.slice(0, MAX_DISPLAY), partialMatch: false };

  const cap = Math.min(list.length, MAX_DISPLAY);
  const byId = new Map(displayed.map((p) => [p.precId, p]));

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (byId.has(p.precId) || shouldHardExclude(p, analysis)) continue;

    const blob = `${p.caseFacts || ""} ${p.gist || ""}`;
    if (
      isWorkplaceSituation(analysis) &&
      isPureCriminalDefamation(p.caseName, blob)
    ) {
      continue;
    }

    const r = byIndex.get(i) || { score: 0, matchNote: "" };
    const score = applyScore(p, i, r);
    byId.set(p.precId, {
      ...p,
      relevanceScore: score,
      relevanceNote:
        r.matchNote ||
        "검색된 판례로, 사실관계·쟁점이 완전히 같지는 않을 수 있습니다.",
      partialMatch: score < MIN_RELEVANCE_SCORE
    });
  }

  const merged = [...byId.values()]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, cap)
    .map((p) => ({
      ...p,
      partialMatch: Boolean(p.partialMatch || p.relevanceScore < MIN_RELEVANCE_SCORE)
    }));

  return {
    precedents: merged,
    partialMatch: merged.some((p) => p.partialMatch)
  };
}

function heuristicBoost(p, analysis) {
  let score = 0;
  const blob = `${p.caseName || ""} ${p.caseFacts || ""} ${p.gist || ""} ${p.holding || ""}`;
  const title = p.caseName || "";
  score += countKeywordHits(blob, title, analysis.precSituationKeywords) * 10;
  for (const q of analysis.precSearchQueries || []) {
    if (q.length >= 2 && blob.includes(q)) score += 6;
  }
  return score;
}

function guaranteeMinimumPrecedents(list, analysis, applyScore, byIndex) {
  if (!list.length) return null;

  const scored = list
    .map((p, i) => {
      const r = byIndex.get(i) || { score: 0, matchNote: "" };
      return {
        ...p,
        relevanceScore: applyScore(p, i, r),
        relevanceNote: r.matchNote,
        partialMatch: true
      };
    })
    .filter((p) => !shouldHardExclude(p, analysis))
    .filter((p) => {
      if (!isWorkplaceSituation(analysis)) return true;
      const blob = `${p.caseFacts || ""} ${p.gist || ""}`;
      return !isPureCriminalDefamation(p.caseName, blob);
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const top = scored.filter((p) => p.relevanceScore >= 10).slice(0, MAX_DISPLAY);
  if (!top.length) return null;

  return {
    precedents: top.map((p) => ({
      ...p,
      relevanceNote:
        p.relevanceNote ||
        "검색된 판례 중 참고할 만한 사례입니다. 사실관계·쟁점이 다를 수 있습니다.",
      partialMatch: true
    })),
    partialMatch: true,
    filteredOut: list.length - top.length
  };
}

function shouldHardExclude(hit, analysis) {
  const title = hit.caseName || "";
  const blob = `${title} ${hit.caseFacts || ""} ${hit.gist || ""}`;
  const negs = analysis.precNegativeSignals || [];
  const kws = analysis.precSituationKeywords || [];
  if (!negs.length) return false;

  const titleNeg = negs.some((neg) => neg.length >= 2 && title.includes(neg));
  if (!titleNeg) return false;

  const kwHits = kws.filter((kw) => kw.length >= 2 && blob.includes(kw)).length;
  return kwHits === 0;
}

/**
 * @returns {Promise<{ precedents: object[], filteredOut: number, guidance?: string }>}
 */
async function rankPrecedentsBySituation(userText, analysis, candidates) {
  const list = (candidates || []).filter((p) => !shouldHardExclude(p, analysis)).slice(0, 8);
  if (!list.length) {
    return {
      precedents: [],
      filteredOut: candidates?.length || 0,
      guidance:
        analysis.emptyGuidance ||
        "검색된 판례 중 작성하신 상황과 유사한 사건을 찾지 못했습니다. 관련 법령 조문과 「지금 할 일」을 참고해 주세요."
    };
  }

  if (!hasOpenAiKey()) {
    return { precedents: list.slice(0, 3), filteredOut: 0 };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const keywords = (analysis.precSituationKeywords || []).join(", ");
  const negatives = (analysis.precNegativeSignals || []).join(", ");
  const domainHint = isWorkplaceSituation(analysis)
    ? "\n맥락: 직장·근로·괴롭힘 — 노동·행정 분쟁 판례 우선, 비직장 형사 명예훼손은 낮게."
    : analysis.precDomain && analysis.precDomain !== "general"
      ? `\n맥락: ${analysis.precDomain}`
      : "";

  const instructions = [
    "당신은 판례 검색 결과의 관련성을 평가합니다. 법률 자문은 하지 않습니다.",
    "사용자가 적은 구체적 상황(사고 유형·쟁점·피해)과 각 판례 사건이 얼마나 유사한지 0~100점으로 채점하세요.",
    "같은 대분류(교통사고·직장)라도 세부 사실이 다르면 점수를 낮추되, 쟁점(과실·손해배상·모욕·해고 등)이 겹치면 45점 이상도 가능.",
    "직장·상사·괴롭힘·퇴근 후 연락 상황이면: 부당노동행위·해고무효·직장내 괴롭힘·근로 분쟁 판례를 우선 높게, 집 앞·전과자 등 형사 명예훼손(공연성)만 다루는 비직장 사건은 35점 이하.",
    "완전히 다른 분야만 다루는 판례(음주·무면허·신호만)는 30점 이하.",
    "반드시 JSON만:",
    '{"rankings":[{"index":0,"score":75,"matchNote":"한 줄"}]}'
  ].join(" ");

  const input = [
    "【사용자 상황】",
    userText,
    analysis.situationSummary ? `\n요약: ${analysis.situationSummary}` : "",
    keywords ? `\n핵심 키워드: ${keywords}` : "",
    negatives ? `\n관련 없을 가능성 높은 주제(사용자 미언급): ${negatives}` : "",
    domainHint,
    "",
    "【판례 후보】",
    list.map((p, i) => buildCandidateBlock(p, i)).join("\n\n")
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        store: false
      }),
      signal: AbortSignal.timeout(28000)
    });

    if (!res.ok) {
      console.warn("[rank-precedents] HTTP", res.status);
      return { precedents: list.slice(0, 3), filteredOut: 0 };
    }

    const data = await res.json();
    const outText = extractResponsesText(data);
    if (!outText) return { precedents: list.slice(0, 3), filteredOut: 0 };

    const parsed = parseJsonFromModel(outText);
    const byIndex = new Map();
    for (const row of parsed.rankings || []) {
      const idx = Number(row.index);
      if (!Number.isFinite(idx) || idx < 0 || idx >= list.length) continue;
      byIndex.set(idx, {
        score: Math.min(100, Math.max(0, Number(row.score) || 0)),
        matchNote: String(row.matchNote || "").slice(0, 120)
      });
    }

    const applyScore = (p, i, r) => {
      const raw = Math.min(
        100,
        (Number(r.score) || 0) + (r.score ? 0 : heuristicBoost(p, analysis))
      );
      return adjustScoreForContext(p, analysis, raw);
    };

    const ranked = list
      .map((p, i) => {
        const r = byIndex.get(i) || { score: 0, matchNote: "" };
        return {
          ...p,
          relevanceScore: applyScore(p, i, r),
          relevanceNote: r.matchNote
        };
      })
      .filter((p) => {
        if (p.relevanceScore < MIN_RELEVANCE_SCORE) return false;
        if (
          isWorkplaceSituation(analysis) &&
          isPureCriminalDefamation(p.caseName, `${p.caseFacts || ""} ${p.gist || ""}`)
        ) {
          return p.relevanceScore >= 55;
        }
        return true;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3);

    const filteredOut = list.length - ranked.length;
    if (ranked.length) {
      const filled = fillSmallPool(ranked, list, analysis, applyScore, byIndex);
      return {
        precedents: filled.precedents,
        filteredOut: list.length - filled.precedents.length,
        partialMatch: filled.partialMatch
      };
    }

    const partial = list
      .map((p, i) => {
        const r = byIndex.get(i) || { score: 0, matchNote: "" };
        return {
          ...p,
          relevanceScore: applyScore(p, i, r),
          relevanceNote: r.matchNote,
          partialMatch: true
        };
      })
      .filter((p) => {
        if (p.relevanceScore < MIN_PARTIAL_SCORE) return false;
        if (
          isWorkplaceSituation(analysis) &&
          isPureCriminalDefamation(p.caseName, `${p.caseFacts || ""} ${p.gist || ""}`)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 2)
      .map((p) => ({
        ...p,
        relevanceNote:
          p.relevanceNote ||
          "사실관계가 완전히 같지는 않지만, 모욕·손해배상 등 유사 쟁점을 참고할 수 있습니다."
      }));

    if (partial.length) {
      const filled = fillSmallPool(partial, list, analysis, applyScore, byIndex);
      return {
        precedents: filled.precedents,
        filteredOut: list.length - filled.precedents.length,
        partialMatch: true
      };
    }

    const lastResort = list
      .map((p, i) => {
        const r = byIndex.get(i) || { score: 0, matchNote: "" };
        return {
          ...p,
          relevanceScore: applyScore(p, i, r),
          relevanceNote: r.matchNote,
          partialMatch: true
        };
      })
      .filter((p) => {
        if (p.relevanceScore < MIN_LAST_RESORT_SCORE) return false;
        if (
          isWorkplaceSituation(analysis) &&
          isPureCriminalDefamation(p.caseName, `${p.caseFacts || ""} ${p.gist || ""}`)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 1)
      .map((p) => ({
        ...p,
        relevanceNote:
          p.relevanceNote ||
          "검색된 판례 중 가장 가까운 사례입니다. 사실관계가 다를 수 있어 참고용으로만 보세요."
      }));

    if (lastResort.length) {
      return {
        precedents: lastResort,
        filteredOut: list.length - 1,
        partialMatch: true
      };
    }

    if (isWorkplaceSituation(analysis)) {
      const laborFallback = list
        .map((p, i) => {
          const r = byIndex.get(i) || { score: 0, matchNote: "" };
          return {
            ...p,
            relevanceScore: applyScore(p, i, r),
            relevanceNote: r.matchNote,
            partialMatch: true
          };
        })
        .filter((p) => {
          const blob = `${p.caseName || ""} ${p.caseFacts || ""} ${p.gist || ""}`;
          if (isPureCriminalDefamation(p.caseName, blob)) return false;
          return /부당노동|해고|직장|근로|괴롭힘|사용자|노동|폭언|모욕|손해배상/.test(blob);
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, 3)
        .map((p) => ({
          ...p,
          relevanceNote:
            p.relevanceNote ||
            "직장·근로 분쟁과 관련된 참고 판례입니다. 사실관계가 다를 수 있습니다."
        }));

      if (laborFallback.length) {
        return {
          precedents: laborFallback,
          filteredOut: list.length - laborFallback.length,
          partialMatch: true
        };
      }
    }

    const guaranteed = guaranteeMinimumPrecedents(list, analysis, applyScore, byIndex);
    if (guaranteed) {
      return guaranteed;
    }

    return {
      precedents: [],
      filteredOut,
      guidance:
        analysis.emptyGuidance ||
        "검색된 판례 중 작성하신 상황과 유사한 사건을 찾지 못했습니다. 법령 조문과 「지금 할 일」을 참고하거나 상황을 더 구체적으로 검색해 보세요."
    };
  } catch (err) {
    console.warn("[rank-precedents]", err.message || err);
    return { precedents: list.slice(0, 3), filteredOut: 0 };
  }
}

module.exports = {
  rankPrecedentsBySituation,
  shouldHardExclude,
  MIN_RELEVANCE_SCORE
};
