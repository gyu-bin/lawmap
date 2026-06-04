/**
 * OpenAI Responses API (client.responses.create와 동일 엔드포인트)
 * POST /v1/responses — model, instructions, input, store: true
 * 법령 본문은 법제처 API만 사용, 본 모듈은「지금 할 일」만 생성
 */

const DEFAULT_FALLBACK =
  "위 조문 원문을 확인하고, 상황에 맞는 증거를 정리한 뒤 필요 시 관할 기관·전문가 상담을 검토하세요.";

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim());
}

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

function buildLawContext(laws) {
  return laws
    .map((l, i) => {
      const snippet = (l.desc || l.core || "").slice(0, 200);
      return `${i + 1}. ${l.name} ${l.clause || ""} — ${l.relevance || "관련 조문"}${snippet ? `\n   조문 요약: ${snippet}` : ""}`;
    })
    .join("\n");
}

async function generateNextAction(userText, laws, options = {}) {
  const fallback = options.fallback || DEFAULT_FALLBACK;
  if (!hasOpenAiKey() || !laws?.length) {
    return { text: fallback, source: "fallback" };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const lawContext = buildLawContext(laws);

  const instructions = [
    "당신은 한국 생활 법률 정보 안내 도우미입니다. 변호사가 아니며 법률 자문이 아닙니다.",
    "사용자에게 실무적으로 지금 할 수 있는 행동만 짧게 안내합니다.",
    "제공된 조문 목록 밖의 법령·조문을 새로 인용하지 마세요.",
    "승소·배상 확정, 과장 표현, 허위 전화번호를 쓰지 마세요.",
    "한국 공식 상담 창구(예: 132 법률구조, 1350 고용노동, 112 경찰)는 필요할 때만 언급하세요."
  ].join(" ");

  const input = [
    "【사용자 상황】",
    userText,
    "",
    "【이미 조회된 법령·조문 — 이것만 근거로 사용】",
    lawContext,
    "",
    "위 상황과 조문에 맞는「지금 할 일」을 한국어 한 단락(3~5문장)으로 작성하세요.",
    "불릿·번호 목록 없이 문장으로만 답하세요."
  ].join("\n");

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
        store: true
      }),
      signal: AbortSignal.timeout(28000)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("[openai] HTTP", res.status, errBody.slice(0, 200));
      return { text: fallback, source: "fallback" };
    }

    const data = await res.json();
    const text = extractResponsesText(data);
    if (!text || text.length < 20) {
      return { text: fallback, source: "fallback" };
    }
    return { text, source: "openai", model };
  } catch (err) {
    console.warn("[openai]", err.message || err);
    return { text: fallback, source: "fallback" };
  }
}

async function enrichWithNextAction(result, userText, fallback) {
  if (!result?.ok || !result.laws?.length) return result;
  const { text, source, model } = await generateNextAction(userText, result.laws, {
    fallback
  });
  return {
    ...result,
    nextAction: text,
    nextActionSource: source,
    ...(model ? { nextActionModel: model } : {})
  };
}

module.exports = {
  DEFAULT_FALLBACK,
  hasOpenAiKey,
  generateNextAction,
  enrichWithNextAction
};
