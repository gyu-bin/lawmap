/**
 * OpenAI — 상황별 핵심 안내 (조회된 법령·판례만 근거)
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

function buildLawContext(laws) {
  return (laws || [])
    .map((l, i) => {
      const snippet = (l.desc || l.core || "").slice(0, 320);
      return `${i + 1}. ${l.name} ${l.clause || ""}${snippet ? `\n   ${snippet}` : ""}`;
    })
    .join("\n");
}

function buildPrecContext(precs) {
  return (precs || [])
    .map((p, i) => {
      const head =
        p.aiSummary ||
        p.judgmentOrder ||
        p.holding ||
        p.caseFacts ||
        p.name ||
        p.caseName;
      const rel = p.aiRelevance || p.relevanceNote || "";
      return `${i + 1}. ${p.name || p.caseName} — ${String(head || "").slice(0, 220)}${
        rel ? `\n   연관: ${rel.slice(0, 120)}` : ""
      }`;
    })
    .join("\n");
}

function trimText(s, max) {
  return String(s || "").trim().slice(0, max);
}

function normalizeBrief(raw) {
  const opening = trimText(raw.opening, 200);
  const coreSummary = trimText(raw.coreSummary, 900);
  const evidenceFocus = trimText(raw.evidenceFocus, 500);
  const actionSteps = trimText(raw.actionSteps, 700);
  const extraNote = trimText(raw.extraNote, 300);

  if (!opening && !coreSummary && !actionSteps) return null;

  return {
    opening,
    coreSummary,
    evidenceFocus,
    actionSteps,
    extraNote
  };
}

/**
 * @returns {Promise<{ brief?: object, nextAction?: string, source?: string, error?: string }>}
 */
async function generateSituationBrief(userText, laws, precedents = [], meta = {}) {
  if (!hasOpenAiKey()) {
    return { error: "no_openai_key" };
  }

  const lawContext = buildLawContext(laws);
  const precContext = buildPrecContext(precedents);
  if (!lawContext && !precContext) {
    return { error: "no_context" };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const label = meta.situationLabel || "";
  const summary = meta.situationSummary || "";

  const instructions = [
    "당신은 한국 생활 법률 정보 안내 도우미입니다. 변호사가 아니며 법률 자문·승소 예측은 하지 않습니다.",
    "제공된 조회 법령·판례 목록만 근거로, 사용자 상황에 맞는 이해하기 쉬운 안내를 작성하세요.",
    "목록에 없는 조문 번호·판례명·법령을 새로 지어내지 마세요. 일반적 절차·증거 보관 조언은 가능합니다.",
    "톤: 공감 한 문장으로 시작(opening). 이어서 핵심 요약(coreSummary)에서 조회된 법령과 연결해 '~에 해당할 수 있습니다' 등 조심스럽게.",
    "직장·폭언·모욕 상황이면 형사(모욕 등) 병행 가능성을 언급할 수 있으나, '확정'·'반드시 성립' 표현 금지.",
    "evidenceFocus: 증거(날짜·시간·발언 기록, 메신저·녹음 보관, 신고 후 불이익 금지 등)를 2~3문장으로 강조.",
    "actionSteps: 지금 할 구체적 순서 3~5문장(기록→신고→회사 조사 요청 등).",
    "extraNote: 선택. 추가로 알려주면 도움이 되는 정보를 1문장(선택 사항).",
    "반드시 JSON만:",
    '{"opening":"...","coreSummary":"...","evidenceFocus":"...","actionSteps":"...","extraNote":"..."}'
  ].join(" ");

  const parts = [
    "【사용자 상황】",
    userText,
    label ? `\n주제: ${label}` : "",
    summary ? `\n요약: ${summary}` : "",
    ""
  ];
  if (lawContext) parts.push("【조회된 법령·조문】", lawContext, "");
  if (precContext) parts.push("【조회된 판례 요약】", precContext, "");

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
        input: parts.filter(Boolean).join("\n"),
        store: false
      }),
      signal: AbortSignal.timeout(32000)
    });

    if (!res.ok) {
      console.warn("[situation-brief] HTTP", res.status);
      return { error: "openai_failed" };
    }

    const data = await res.json();
    const outText = extractResponsesText(data);
    if (!outText) return { error: "openai_empty" };

    const parsed = parseJsonFromModel(outText);
    const brief = normalizeBrief(parsed);
    if (!brief) return { error: "openai_empty" };

    return {
      brief,
      nextAction: brief.actionSteps,
      source: "openai",
      model
    };
  } catch (err) {
    console.warn("[situation-brief]", err.message || err);
    return { error: "openai_error" };
  }
}

async function enrichWithSituationBrief(result, userText, precedents = [], meta = {}) {
  if (!result?.ok) return result;

  const cards = precedents?.length ? precedents : result.precedents;
  const { brief, nextAction, source, model, error } = await generateSituationBrief(
    userText,
    result.laws,
    cards,
    {
      situationLabel: meta.situationLabel || result.situationLabel,
      situationSummary: meta.situationSummary || result.situationSummary
    }
  );

  return {
    ...result,
    situationBrief: brief || undefined,
    nextAction: nextAction || undefined,
    nextActionSource: source || undefined,
    nextActionError: error,
    ...(model ? { nextActionModel: model } : {})
  };
}

module.exports = {
  generateSituationBrief,
  enrichWithSituationBrief,
  normalizeBrief
};
