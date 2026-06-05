/**
 * LawMap 테마 (라이트 / 다크) — localStorage + 시스템 설정
 */
(function (global) {
  const THEME_KEY = "lawmap:theme";

  function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getStoredTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      /* ignore */
    }
    return null;
  }

  function getTheme() {
    return getStoredTheme() || getSystemTheme();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      const isDark = theme === "dark";
      btn.setAttribute("aria-pressed", isDark ? "true" : "false");
      btn.setAttribute("aria-label", isDark ? "라이트 모드로 전환" : "다크 모드로 전환");
      const label = btn.querySelector(".theme-toggle-label");
      if (label) label.textContent = isDark ? "라이트" : "다크";
    });
  }

  function setTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    applyTheme(next);
    return next;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || getTheme();
    return setTheme(current === "dark" ? "light" : "dark");
  }

  function initTheme() {
    applyTheme(getTheme());
    document.querySelectorAll(".theme-toggle").forEach((btn) => {
      if (btn.dataset.themeBound) return;
      btn.dataset.themeBound = "1";
      btn.addEventListener("click", () => toggleTheme());
    });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!getStoredTheme()) applyTheme(e.matches ? "dark" : "light");
    });
  }

  global.LawMapTheme = {
    THEME_KEY,
    getTheme,
    setTheme,
    toggleTheme,
    initTheme
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
  } else {
    initTheme();
  }
})(typeof window !== "undefined" ? window : globalThis);
