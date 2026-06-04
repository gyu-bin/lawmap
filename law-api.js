/**
 * LawMap 법령 API
 * 1순위: /api/law/search → 법제처 Open API(DRF) 실시간 조회 (LAW_OC)
 * 2순위: 법망 REST (LAW_OC 없거나 서버 미구동 시)
 */
(function (global) {
  const BEOPMANG_BASE = "https://api.beopmang.org/api/v4";
  const BEOPMANG_HEALTH = "https://api.beopmang.org/health";
  const API_SEARCH = "/api/law/search";

  async function fetchFromProxy(userText) {
    const url = `${API_SEARCH}?${new URLSearchParams({
      text: userText
    })}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data.error === "no_law_oc") {
      return { ok: false, noLawOc: true, message: data.message };
    }
    if (!res.ok && res.status !== 200) {
      return {
        ok: false,
        maintenance: data.maintenance,
        error: data.error,
        keySummary: data.keySummary
      };
    }
    if (data.koreanLawFailed || data.error === "korean_law_empty") {
      return {
        ok: false,
        empty: true,
        koreanLawFailed: true,
        situationLabel: data.situationLabel,
        error: data.error,
        detail: data.detail
      };
    }
    if (data.ok && (data.laws?.length || data.precedents?.length)) {
      return {
        ok: true,
        source: data.source || "korean-law",
        laws: data.laws || [],
        precedents: data.precedents || [],
        precListCount: data.precListCount,
        precQueries: data.precQueries,
        keySummary: data.keySummary,
        route: data.route,
        situationLabel: data.situationLabel,
        nextAction: data.nextAction,
        nextActionSource: data.nextActionSource
      };
    }
    return {
      ok: false,
      empty: data.error === "empty",
      maintenance: data.maintenance,
      keySummary: data.keySummary
    };
  }

  async function checkBeopmangHealth() {
    try {
      const res = await fetch(BEOPMANG_HEALTH, { headers: { Accept: "application/json" } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error === "service_maintenance") {
        return { maintenance: true };
      }
      return { ok: res.ok && data.ok === true };
    } catch {
      return { unavailable: true };
    }
  }

  async function beopmangSearchLaw(query) {
    const url = `${BEOPMANG_BASE}/law?action=search&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 503) {
      const err = new Error("service_maintenance");
      err.code = "maintenance";
      throw err;
    }
    if (!res.ok) throw new Error(`beopmang HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.startsWith("error code")) throw new Error("beopmang blocked");
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  function normalizeSearchHits(payload) {
    if (!payload || typeof payload !== "object") return [];
    const candidates =
      payload.results ||
      payload.items ||
      payload.laws ||
      payload.data ||
      (Array.isArray(payload) ? payload : null);
    if (!Array.isArray(candidates)) return [];
    return candidates
      .map((item, index) => {
        const name =
          item.law_name || item.lawName || item.name || item.title || "법령";
        return {
          num: index + 1,
          name,
          clause: item.article || "관련 조문",
          relevance: item.type || "법망 검색",
          core: item.summary || `${name} 관련 규정입니다.`,
          desc: item.description || "법망 API 검색 결과",
          link: `https://www.law.go.kr/법령/${encodeURIComponent(name)}`,
          source: "beopmang"
        };
      })
      .slice(0, 5);
  }

  function pickSearchQueries(userText) {
    const trimmed = (userText || "").trim();
    if (!trimmed) return [];
    const queries = [trimmed.slice(0, 80)];
    const tokens = trimmed
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && w.length <= 20)
      .sort((a, b) => b.length - a.length);
    for (const w of tokens) {
      if (!queries.includes(w)) queries.push(w);
    }
    return queries.slice(0, 4);
  }

  async function fetchBeopmangCards(userText) {
    const health = await checkBeopmangHealth();
    if (health.maintenance) return { ok: false, maintenance: true, tried: true };

    for (const query of pickSearchQueries(userText)) {
      try {
        const payload = await beopmangSearchLaw(query);
        const hits = normalizeSearchHits(payload);
        if (hits.length > 0) {
          return {
            ok: true,
            source: "beopmang",
            laws: hits,
            nextAction:
              "조문 원문을 확인하고, 상황에 맞는 증거를 정리한 뒤 필요 시 관할 기관·전문가 상담을 검토하세요."
          };
        }
      } catch (err) {
        if (err.code === "maintenance") {
          return { ok: false, maintenance: true, tried: true };
        }
      }
    }
    return { ok: false, empty: true, tried: true };
  }

  async function fetchLiveLawCards(_scenarioKey, userText) {
    try {
      const proxy = await fetchFromProxy(userText);
      if (proxy.ok) return proxy;
      if (proxy.koreanLawFailed || proxy.empty || proxy.detail) {
        return proxy;
      }
      if (proxy.noLawOc) {
        const beop = await fetchBeopmangCards(userText);
        if (beop.ok) return beop;
        return {
          ok: false,
          noLawOc: true,
          maintenance: beop.maintenance,
          message: proxy.message,
          tried: true
        };
      }
    } catch {
      /* static host without server.js — try beopmang direct */
    }

    return fetchBeopmangCards(userText);
  }

  global.LawApi = {
    BEOPMANG_BASE,
    BEOPMANG_HEALTH,
    API_SEARCH,
    fetchLiveLawCards
  };
})(typeof window !== "undefined" ? window : globalThis);
