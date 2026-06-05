document.addEventListener("DOMContentLoaded", () => {
  const shared = window.LawMapShared;
  if (!shared) return;
  const {
    saveSituation,
    loadSearchHistory,
    removeSearchHistoryItem,
    clearSearchHistory
  } = shared;
  const searchForm = document.getElementById("law-search-form");
  const situationInput = document.getElementById("situation-input");
  const submitBtn = document.getElementById("submit-btn");
  const charCounter = document.getElementById("char-counter");
  const exampleChips = document.querySelectorAll(".example-chip");
  const navBtnSearch = document.getElementById("nav-btn-search");
  const toastMsg = document.getElementById("toast-msg");
  const historyBlock = document.getElementById("search-history");
  const historyList = document.getElementById("search-history-list");
  const clearHistoryBtn = document.getElementById("clear-history-btn");

  const showToast = (message) => {
    if (!toastMsg) return;
    toastMsg.textContent = message;
    toastMsg.classList.add("show");
    setTimeout(() => toastMsg.classList.remove("show"), 2000);
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const formatHistoryDate = (ts) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const goToResults = (text) => {
    saveSituation(text);
    window.location.href = "results.html";
  };

  const renderSearchHistory = () => {
    if (!historyBlock || !historyList) return;
    const items = loadSearchHistory();
    if (!items.length) {
      historyBlock.classList.add("hidden");
      historyBlock.setAttribute("hidden", "");
      historyList.innerHTML = "";
      return;
    }

    historyBlock.classList.remove("hidden");
    historyBlock.removeAttribute("hidden");
    historyList.innerHTML = items
      .map(
        (item, index) => `
      <li class="search-history-item">
        <button type="button" class="search-history-btn" data-index="${index}">
          <span class="search-history-text">${escapeHtml(item.text)}</span>
          <span class="search-history-date">${escapeHtml(formatHistoryDate(item.ts))}</span>
        </button>
        <button type="button" class="search-history-remove" data-id="${item.id}" aria-label="검색 기록 삭제">×</button>
      </li>`
      )
      .join("");

    historyList.querySelectorAll(".search-history-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-index"));
        const text = items[index]?.text;
        if (text) goToResults(text);
      });
    });

    historyList.querySelectorAll(".search-history-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute("data-id"));
        if (Number.isFinite(id)) {
          removeSearchHistoryItem(id);
          renderSearchHistory();
        }
      });
    });
  };

  const updateCharCount = () => {
    const len = situationInput.value.length;
    charCounter.textContent = `${len}/500자`;
    if (len >= 500) {
      charCounter.style.color = "#d9534f";
      charCounter.style.fontWeight = "700";
    } else {
      charCounter.style.color = "var(--mute-color)";
      charCounter.style.fontWeight = "500";
    }
  };

  situationInput.addEventListener("input", updateCharCount);

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = situationInput.value.trim();
    if (!text) {
      showToast("상황을 입력해 주세요.");
      situationInput.focus();
      return;
    }
    if (submitBtn) submitBtn.classList.add("loading");
    goToResults(text);
  });

  exampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const prompt = chip.getAttribute("data-prompt") || chip.textContent.trim();
      situationInput.value = prompt;
      updateCharCount();
      const searchCard = document.getElementById("search-card");
      searchCard.scrollIntoView({ behavior: "smooth", block: "center" });
      searchCard.style.borderColor = "var(--primary-color)";
      searchCard.style.boxShadow = "0 0 0 4px rgba(76, 175, 114, 0.25)";
      setTimeout(() => {
        searchCard.style.borderColor = "rgba(76, 175, 114, 0.1)";
        searchCard.style.boxShadow = "var(--shadow-md)";
      }, 1000);
    });
  });

  navBtnSearch.addEventListener("click", (e) => {
    e.preventDefault();
    situationInput.focus();
    document.getElementById("search-card").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  clearHistoryBtn?.addEventListener("click", () => {
    clearSearchHistory();
    renderSearchHistory();
    showToast("최근 검색 기록을 삭제했습니다.");
  });

  updateCharCount();
  renderSearchHistory();
});
