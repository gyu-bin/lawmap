/**
 * OpenAI —「지금 할 일」생성 (조회된 법령·판례만 근거)
 */
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
  return (laws || [])
    .map((l, i) => {
      const snippet = (l.desc || l.core || "").slice(0, 200);
      return `${i + 1}. ${l.name} ${l.clause || ""}${snippet ? `\n   ${snippet}` : ""}`;
    })
    .join("\n");
}

function buildPrecContext(precs) {
  return (precs || [])
    .map((p, i) => {
      const head = p.judgmentOrder || p.holding || p.caseFacts || p.name;
      return `${i + 1}. ${p.name} — ${String(head || "").slice(0, 180)}`;
    })
    .join("\n");
}

async function generateNextAction(userText, laws, precedents = []) {
  if (!hasOpenAiKey()) {
    return { text: null, source: null, error: "no_openai_key" };
  }

  const lawContext = buildLawContext(laws);
  const precContext = buildPrecContext(precedents);
  if (!lawContext && !precContext) {
    return { text: null, source: null, error: "no_context" };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const instructions = [
    "당신은 한국 생활 법률 정보 안내 도우미입니다. 변호사가 아니며 법률 자문이 아닙니다.",
    "제공된 조문·판례 목록만 근거로「지금 할 일」을 한국어 3~5문장으로 작성하세요.",
    "목록에 없는 법령·조문·판례를 새로 인용하지 마세요.",
    "승소·배상 확정 등 과장 표현을 쓰지 마세요."
  ].join(" ");

  const parts = ["【사용자 상황】", userText, ""];
  if (lawContext) parts.push("【조회된 법령·조문】", lawContext, "");
  if (precContext) parts.push("【조회된 판례】", precContext, "");
  parts.push("불릿 없이 문장으로만 답하세요.");

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
        input: parts.join("\n"),
        store: false
      }),
      signal: AbortSignal.timeout(28000)
    });

    if (!res.ok) {
      console.warn("[openai:nextAction] HTTP", res.status);
      return { text: null, source: null, error: "openai_failed" };
    }

    const data = await res.json();
    const text = extractResponsesText(data);
    if (!text || text.length < 15) {
      return { text: null, source: null, error: "openai_empty" };
    }
    return { text, source: "openai", model };
  } catch (err) {
    console.warn("[openai:nextAction]", err.message || err);
    return { text: null, source: null, error: "openai_error" };
  }
}

async function enrichWithNextAction(result, userText, precedents = []) {
  if (!result?.ok) return result;
  const { text, source, model, error } = await generateNextAction(
    userText,
    result.laws,
    precedents?.length ? precedents : result.precedents
  );
  return {
    ...result,
    nextAction: text || undefined,
    nextActionSource: source || undefined,
    nextActionError: error,
    ...(model ? { nextActionModel: model } : {})
  };
}

module.exports = {
  hasOpenAiKey,
  generateNextAction,
  enrichWithNextAction
};
