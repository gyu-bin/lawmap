/**
 * OpenAI 상황 분석 → 법제처 API 검색어 생성
 * 법령·판례 본문은 생성하지 않음 (검색 쿼리·메타만)
 */
const { hasOpenAiKey } = require("./generate-next-action.js");

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

function sanitizeQueries(arr, userText, max) {
  const out = [];
  for (const q of Array.isArray(arr) ? arr : []) {
    const s = String(q).trim().slice(0, 80);
    if (s.length >= 2 && !out.includes(s)) out.push(s);
  }
  const fallback = String(userText || "").trim().slice(0, 80);
  if (!out.length && fallback.length >= 2) out.push(fallback);
  return out.slice(0, max);
}

function normalizeAnalysis(raw, userText) {
  const loadingHints = Array.isArray(raw.loadingHints)
    ? raw.loadingHints.map((h) => String(h).trim()).filter(Boolean).slice(0, 5)
    : [];

  return {
    ok: true,
    label: String(raw.label || "일반").slice(0, 40),
    legalIntent: raw.legalIntent !== false,
    shouldSearchPrecedents: raw.shouldSearchPrecedents !== false,
    situationSummary: String(raw.situationSummary || "").slice(0, 240),
    lawSearchQueries: sanitizeQueries(raw.lawSearchQueries, userText, 6),
    precSearchQueries: sanitizeQueries(raw.precSearchQueries, userText, 6),
    precSituationKeywords: sanitizeQueries(raw.precSituationKeywords, userText, 10),
    precNegativeSignals: sanitizeQueries(raw.precNegativeSignals, userText, 8),
    precDomain: String(raw.precDomain || "general").slice(0, 24),
    precLawRef: String(raw.precLawRef || "").slice(0, 80),
    emptyGuidance: String(raw.emptyGuidance || "").slice(0, 400),
    precSkipGuidance: String(raw.precSkipGuidance || raw.emptyGuidance || "").slice(0, 400),
    loadingHints:
      loadingHints.length >= 2
        ? loadingHints
        : [
            "AI가 상황을 분석하고 있습니다…",
            "법제처 API에서 법령·조문을 검색합니다…",
            "관련 판례를 조회합니다…",
            "판례를 쉬운 말로 요약하고 있습니다…"
          ]
  };
}

async function analyzeSituation(userText) {
  const text = String(userText || "").trim();
  if (!text) {
    return { ok: false, error: "missing_text" };
  }
  if (!hasOpenAiKey()) {
    return {
      ok: false,
      error: "no_openai_key",
      message:
        ".env에 OPENAI_API_KEY를 설정하세요. 상황 분석·검색어 생성·실무 안내는 OpenAI가 필요합니다."
    };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const instructions = [
    "당신은 한국 법률 정보 검색 도우미입니다. 법률 자문·판결 예측은 하지 않습니다.",
    "사용자 상황을 읽고 법제처 Open API 검색에 쓸 키워드만 JSON으로 반환합니다.",
    "조문 원문·법령 번호·판례 내용을 지어내지 마세요.",
    "판례 검색(precSearchQueries)에는 법령명(교통사고처리특례법)만 넣지 말고, 사건 유형·쟁점 키워드를 넣으세요. 예: 워셔액, 시야 가림, 전방주시의무, 불법행위 손해배상.",
    "직장 내 괴롭힘·모욕·상사: precSearchQueries에 '직장 모욕 명예훼손', '손해배상 직장' 등 유사 사건 키워드 포함(법령명만 금지).",
    "precSituationKeywords: 사용자 상황에서 판례 본문·사건명과 매칭할 핵심 단어 4~10개.",
    "precNegativeSignals: 사용자가 언급하지 않은 불필요한 판례 주제(음주운전, 무면허, 신호위반 등) — 해당 주제만 다루는 판례는 제외용.",
    "일상 감정만 있고 법적 분쟁이 없으면 legalIntent=false, shouldSearchPrecedents=false.",
    "반드시 아래 JSON만 출력하세요(다른 텍스트 없음):",
    '{"label":"짧은 주제(한국어)","legalIntent":true,"shouldSearchPrecedents":true,',
    '"situationSummary":"한 줄 요약",',
    '"lawSearchQueries":["법령 aiSearch용 키워드 2~6개"],',
    '"precSearchQueries":["판례 검색용 사건·쟁점 키워드 2~6개"],',
    '"precSituationKeywords":["상황 매칭 키워드 4~10개"],',
    '"precNegativeSignals":["제외할 무관 주제 0~8개"],',
    '"precDomain":"workplace|traffic|housing|consumer|general 중 하나",',
    '"precLawRef":"판례 JO 필터용 법령명 또는 빈 문자열",',
    '"emptyGuidance":"결과가 없을 때 사용자에게 보여줄 한국어 안내",',
    '"precSkipGuidance":"판례 검색을 하지 않을 때 안내(선택)",',
    '"loadingHints":["로딩1","로딩2","로딩3"]}'
  ].join(" ");

  const input = `【사용자 상황】\n${text}`;

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
      const errBody = await res.text().catch(() => "");
      console.warn("[analyze-situation] HTTP", res.status, errBody.slice(0, 200));
      return { ok: false, error: "openai_failed", detail: "상황 분석 AI 호출에 실패했습니다." };
    }

    const data = await res.json();
    const outText = extractResponsesText(data);
    if (!outText) {
      return { ok: false, error: "openai_empty", detail: "상황 분석 결과가 비어 있습니다." };
    }

    const parsed = parseJsonFromModel(outText);
    return normalizeAnalysis(parsed, text);
  } catch (err) {
    console.warn("[analyze-situation]", err.message || err);
    return { ok: false, error: "openai_error", detail: err.message || "상황 분석 중 오류" };
  }
}

module.exports = {
  analyzeSituation,
  normalizeAnalysis,
  sanitizeQueries
};
