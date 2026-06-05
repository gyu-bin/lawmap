/**
 * OpenAI — 판례별 평이 요약 (건당 1회 호출)
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

function buildPrecBlock(p) {
  const lines = [p.caseName || "판례"];
  const meta = [p.court, p.caseNo, p.date].filter(Boolean).join(" · ");
  if (meta) lines.push(meta);
  if (p.caseFacts) lines.push(`사건: ${String(p.caseFacts).slice(0, 900)}`);
  if (p.judgmentOrder) lines.push(`주문: ${String(p.judgmentOrder).slice(0, 400)}`);
  if (p.holding) lines.push(`판시사항: ${String(p.holding).slice(0, 400)}`);
  if (p.gist) lines.push(`판결요지: ${String(p.gist).slice(0, 400)}`);
  if (p.courtAnalysis) lines.push(`법원 판단: ${String(p.courtAnalysis).slice(0, 500)}`);
  return lines.join("\n");
}

async function summarizeOnePrecedent(userText, prec) {
  if (!hasOpenAiKey()) {
    return { ...prec, aiSummary: null, aiRelevance: null };
  }

  const model = (process.env.OPENAI_MODEL || "gpt-5.4-mini").trim();
  const instructions = [
    "당신은 한국 판례를 일반인에게 설명하는 도우미입니다. 변호사가 아니며 법률 자문·승소 예측은 하지 않습니다.",
    "제공된 판례 텍스트만 근거로 평이한 한국어 요약을 작성하세요. 없는 사실·법리를 추가하지 마세요.",
    "plainSummary: 3~4문장 — 무슨 일이었는지, 법원이 어떻게 판단·결론 냈는지.",
    "yourSituation: 1문장 — 사용자 상황과 연관될 수 있는 점을 '~할 수 있습니다' 등 조심스럽게.",
    '반드시 JSON만: {"plainSummary":"...","yourSituation":"..."}'
  ].join(" ");

  const input = [
    "【사용자 상황】",
    userText,
    "",
    "【판례 원문 발췌】",
    buildPrecBlock(prec)
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
        store: false
      }),
      signal: AbortSignal.timeout(28000)
    });

    if (!res.ok) {
      console.warn("[summarize-precedents] HTTP", res.status);
      return { ...prec, aiSummary: null, aiRelevance: null };
    }

    const data = await res.json();
    const outText = extractResponsesText(data);
    if (!outText) return { ...prec, aiSummary: null, aiRelevance: null };

    const parsed = parseJsonFromModel(outText);
    const plain = String(parsed.plainSummary || parsed.summary || "").trim();
    const rel = String(parsed.yourSituation || parsed.relevance || "").trim();
    if (!plain) return { ...prec, aiSummary: null, aiRelevance: null };

    return {
      ...prec,
      aiSummary: plain.slice(0, 600),
      aiRelevance: rel.slice(0, 240)
    };
  } catch (err) {
    console.warn("[summarize-precedents]", err.message || err);
    return { ...prec, aiSummary: null, aiRelevance: null };
  }
}

/**
 * @param {string} userText
 * @param {object[]} precedents
 * @returns {Promise<object[]>}
 */
async function summarizePrecedents(userText, precedents) {
  const list = (precedents || []).slice(0, 3);
  if (!list.length) return list;
  return Promise.all(list.map((p) => summarizeOnePrecedent(userText, p)));
}

module.exports = { summarizePrecedents, summarizeOnePrecedent };
