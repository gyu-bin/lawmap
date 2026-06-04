document.addEventListener("DOMContentLoaded", () => {
  const shared = window.LawMapShared;
  if (!shared) return;
  const { CHIP_TEXT, saveSituation } = shared;
  const searchForm = document.getElementById("law-search-form");
  const situationInput = document.getElementById("situation-input");
  const charCounter = document.getElementById("char-counter");
  const exampleChips = document.querySelectorAll(".example-chip");
  const navBtnSearch = document.getElementById("nav-btn-search");
  const toastMsg = document.getElementById("toast-msg");

  const showToast = (message) => {
    if (!toastMsg) return;
    toastMsg.textContent = message;
    toastMsg.classList.add("show");
    setTimeout(() => toastMsg.classList.remove("show"), 2000);
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

  const goToResults = (text) => {
    saveSituation(text);
    window.location.href = "results.html";
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
    goToResults(text);
  });

  exampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const scenarioKey = chip.getAttribute("data-scenario");
      situationInput.value = (CHIP_TEXT && CHIP_TEXT[scenarioKey]) || "";
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

  updateCharCount();
});
