/**
 * LawMap 법령 API
 * 1순위: 로컬 /api/law/search → korean-law-mcp CLI (LAW_OC)
 * 2순위: 법망 REST (점검·장애 시 fallback)
 */
(function (global) {
  const BEOPMANG_BASE = "https://api.beopmang.org/api/v4";
  const BEOPMANG_HEALTH = "https://api.beopmang.org/health";
  const API_SEARCH = "/api/law/search";

  async function fetchFromProxy(scenarioKey, userText) {
    const url = `${API_SEARCH}?${new URLSearchParams({
      text: userText,
      scenario: scenarioKey
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
        guide: data.guide
      };
    }
    if (data.koreanLawFailed) {
      return {
        ok: false,
        empty: true,
        error: data.error,
        guide: data.guide,
        detail: data.detail
      };
    }
    if (data.ok && data.laws?.length) {
      return {
        ok: true,
        source: data.source || "korean-law",
        laws: data.laws,
        guide: data.guide,
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
      guide: data.guide
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

  const scenarioLawHints = {
    layoff: ["근로기준법", "부당해고"],
    rent: ["주택임대차보호법", "임대차"],
    refund: ["전자상거래", "소비자보호"],
    bullying: ["근로기준법", "직장 내 괴롭힘"],
    salary: ["근로기준법", "임금"],
    general: ["민법", "불법행위", "도로교통법"]
  };

  function pickSearchQueries(scenarioKey, userText) {
    const hints = scenarioLawHints[scenarioKey] || scenarioLawHints.general;
    const trimmed = (userText || "").trim();
    const queries = [...hints];
    if (trimmed.includes("물") && trimmed.includes("벼락")) {
      queries.unshift("불법행위", "민법");
    } else if (trimmed.length > 4 && trimmed.length <= 40) {
      queries.unshift(trimmed.slice(0, 40));
    }
    return [...new Set(queries)].slice(0, 3);
  }

  async function fetchBeopmangCards(scenarioKey, userText) {
    const health = await checkBeopmangHealth();
    if (health.maintenance) return { ok: false, maintenance: true, tried: true };

    for (const query of pickSearchQueries(scenarioKey, userText)) {
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

  async function fetchLiveLawCards(scenarioKey, userText) {
    try {
      const proxy = await fetchFromProxy(scenarioKey, userText);
      if (proxy.ok) return proxy;
      if (proxy.noLawOc) {
        const beop = await fetchBeopmangCards(scenarioKey, userText);
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

    return fetchBeopmangCards(scenarioKey, userText);
  }

  global.LawApi = {
    BEOPMANG_BASE,
    BEOPMANG_HEALTH,
    API_SEARCH,
    fetchLiveLawCards
  };
})(typeof window !== "undefined" ? window : globalThis);
