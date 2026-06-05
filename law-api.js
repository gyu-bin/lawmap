/**
 * LawMap — /api/law/search 프록시만 사용 (법제처 API + OpenAI)
 */
(function (global) {
  const API_SEARCH = "/api/law/search";

  async function fetchLiveLawCards(_scenarioKey, userText) {
    const url = `${API_SEARCH}?${new URLSearchParams({ text: userText })}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));

    if (res.status === 503 && (data.error === "no_law_oc" || data.error === "no_openai_key")) {
      return {
        ok: false,
        noLawOc: data.error === "no_law_oc",
        noOpenAi: data.error === "no_openai_key",
        message: data.message || data.detail
      };
    }

    if (data.ok && (data.laws?.length || data.precedents?.length)) {
      return {
        ok: true,
        source: data.source || "korean-law",
        laws: data.laws || [],
        precedents: data.precedents || [],
        precListCount: data.precListCount,
        precSearchedCount: data.precSearchedCount,
        precSkipReason: data.precSkipReason,
        precSkipGuidance: data.precSkipGuidance,
        precPartialMatch: data.precPartialMatch,
        keySummary: data.keySummary,
        situationLabel: data.situationLabel,
        situationSummary: data.situationSummary,
        situationBrief: data.situationBrief,
        loadingHints: data.loadingHints,
        nextAction: data.nextAction,
        nextActionSource: data.nextActionSource
      };
    }

    return {
      ok: false,
      empty: true,
      koreanLawFailed: data.koreanLawFailed,
      error: data.error,
      detail: data.detail,
      message: data.message,
      situationLabel: data.situationLabel,
      situationSummary: data.situationSummary,
      loadingHints: data.loadingHints,
      precSkipReason: data.precSkipReason,
      precSkipGuidance: data.precSkipGuidance
    };
  }

  global.LawApi = {
    API_SEARCH,
    fetchLiveLawCards
  };
})(typeof window !== "undefined" ? window : globalThis);
