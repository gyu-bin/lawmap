/**
 * LawMap 공통 (홈 · 결과 페이지)
 */
(function (global) {
  const SITUATION_STORAGE_KEY = "lawmap:situation";
  const SEARCH_HISTORY_KEY = "lawmap:search-history";
  const MAX_SEARCH_HISTORY = 15;

  function saveSituation(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      sessionStorage.setItem(SITUATION_STORAGE_KEY, trimmed);
    } catch {
      /* ignore */
    }
    addSearchHistory(trimmed);
  }

  function loadSituation() {
    try {
      return sessionStorage.getItem(SITUATION_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function clearSituation() {
    try {
      sessionStorage.removeItem(SITUATION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function loadSearchHistory() {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function addSearchHistory(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    try {
      const now = Date.now();
      const next = [
        { id: now, text: trimmed, ts: now },
        ...loadSearchHistory().filter((item) => item.text !== trimmed)
      ].slice(0, MAX_SEARCH_HISTORY);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function removeSearchHistoryItem(id) {
    try {
      const next = loadSearchHistory().filter((item) => item.id !== id);
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function clearSearchHistory() {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch {
      /* ignore */
    }
  }

  global.LawMapShared = {
    SITUATION_STORAGE_KEY,
    SEARCH_HISTORY_KEY,
    MAX_SEARCH_HISTORY,
    saveSituation,
    loadSituation,
    clearSituation,
    loadSearchHistory,
    addSearchHistory,
    removeSearchHistoryItem,
    clearSearchHistory
  };
})(typeof window !== "undefined" ? window : globalThis);
