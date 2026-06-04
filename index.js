// ==========================================================================
// LawMap — 법령 API 결과만 표시 (하드코딩 mock 없음)
// ==========================================================================

const SCENARIO_LABELS = {
  layoff: "근로·해고",
  rent: "임대차",
  refund: "환불·전자상거래",
  bullying: "직장 내 괴롭힘",
  salary: "임금·퇴직금",
  overtime: "야근·주말근무",
  general: "일반"
};

document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.getElementById("law-search-form");
  const situationInput = document.getElementById("situation-input");
  const charCounter = document.getElementById("char-counter");
  const submitBtn = document.getElementById("submit-btn");
  const exampleChips = document.querySelectorAll(".example-chip");
  const resultsSection = document.getElementById("results-section");
  const summaryText = document.getElementById("summary-text");
  const lawCardsList = document.getElementById("law-cards-list");
  const nextActionCard = document.getElementById("next-action-card");
  const nextActionText = document.getElementById("next-action-text");
  const nextActionSource = document.getElementById("next-action-source");
  const compText = document.getElementById("comp-text");
  const comprehensiveCard = document.getElementById("comprehensive-card");
  const resetBtnTop = document.getElementById("reset-search-btn-top");
  const resetBtnBottom = document.getElementById("reset-search-btn-bottom");
  const toastMsg = document.getElementById("toast-msg");
  const navBtnSearch = document.getElementById("nav-btn-search");

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

  const showToast = (message) => {
    toastMsg.textContent = message;
    toastMsg.classList.add("show");
    setTimeout(() => toastMsg.classList.remove("show"), 2000);
  };

  const analyzeInputScenario = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return "general";

    const keywords = {
      layoff: ["해고", "자르", "보내", "해직", "권고사직", "계약해지", "문자해고"],
      rent: ["집주인", "임대", "임차", "월세", "전세", "보증금", "방빼", "계약갱신", "퇴거", "상가"],
      refund: ["환불", "반품", "취소", "소비자", "전자상거래", "쇼핑몰", "구매취소", "거부"],
      bullying: ["괴롭", "폭언", "욕설", "따돌림", "직장내", "상사", "가혹", "모욕"],
      salary: ["월급", "급여", "임금", "체불", "퇴직금", "수당", "돈 안", "미지급", "일당"],
      overtime: ["야근", "주말근무", "연장근로", "휴일근무", "프리랜서", "철야", "주말에도"]
    };

    let bestScenario = "general";
    let maxMatches = 0;
    for (const [scenario, list] of Object.entries(keywords)) {
      let matches = 0;
      list.forEach((kw) => {
        if (cleanText.includes(kw)) matches++;
      });
      if (matches > maxMatches) {
        maxMatches = matches;
        bestScenario = scenario;
      }
    }
    return bestScenario;
  };

  const bindCopyButtons = () => {
    lawCardsList.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const textToCopy = btn.getAttribute("data-copy-text");
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            const btnSpan = btn.querySelector("span");
            const originalText = btnSpan.textContent;
            btnSpan.textContent = "복사 완료!";
            btn.style.backgroundColor = "var(--primary-color)";
            btn.style.color = "var(--white)";
            btn.style.borderColor = "var(--primary-color)";
            showToast("법령 정보가 클립보드에 복사되었습니다.");
            setTimeout(() => {
              btnSpan.textContent = originalText;
              btn.style.backgroundColor = "rgba(76, 175, 114, 0.02)";
              btn.style.color = "var(--primary-color)";
              btn.style.borderColor = "rgba(76, 175, 114, 0.2)";
            }, 2000);
          })
          .catch(() => showToast("복사 실패: 브라우저 권한을 확인해주세요."));
      });
    });
  };

  const renderLawCards = (laws) => {
    lawCardsList.innerHTML = "";
    laws.forEach((law) => {
      const card = document.createElement("article");
      card.className = "law-card";
      card.innerHTML = `
        <div class="law-card-header">
          <div class="header-left">
            <span class="num-badge">${law.num}</span>
            <div class="law-title-group">
              <span class="law-name">${law.name}</span>
              <h4 class="clause-name">${law.clause}</h4>
            </div>
          </div>
          <span class="relevance-badge">${law.relevance}</span>
        </div>
        <div class="divider"></div>
        <div class="core-box">
          <span class="core-title">조문 원문 (법제처 API)</span>
          <p class="law-body-desc">${law.desc || law.core || ""}</p>
        </div>
        <div class="law-card-footer">
          <a href="${law.link}" target="_blank" rel="noopener noreferrer" class="official-link">
            법제처 법령 정보 원문 보기
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
          <button type="button" class="copy-btn" data-copy-text="${law.name} ${law.clause}: ${law.core}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>복사하기</span>
          </button>
        </div>
      `;
      lawCardsList.appendChild(card);
    });
    bindCopyButtons();
  };

  const hideNextAction = () => {
    if (!nextActionCard) return;
    nextActionCard.classList.add("hidden");
    nextActionCard.setAttribute("hidden", "");
  };

  const DEFAULT_NEXT_ACTION =
    "위 조문 원문을 확인하고, 상황에 맞는 증거를 정리한 뒤 필요 시 관할 기관·전문가 상담을 검토하세요.";

  const renderNextAction = (text, source) => {
    if (!nextActionCard || !nextActionText) return;
    const action = (text && String(text) !== "undefined" ? text : "").trim() || DEFAULT_NEXT_ACTION;
    nextActionText.textContent = action;
    if (nextActionSource) {
      if (source === "openai") {
        nextActionSource.textContent = "OpenAI 생성 · 참고용(법률 자문 아님)";
        nextActionSource.classList.remove("hidden");
      } else {
        nextActionSource.textContent = "";
        nextActionSource.classList.add("hidden");
      }
    }
    nextActionCard.classList.remove("hidden");
    nextActionCard.removeAttribute("hidden");
  };

  const renderEmptyState = (message, detail, extraDetail) => {
    hideNextAction();
    lawCardsList.innerHTML = `
      <div class="empty-state" role="alert">
        <p class="empty-state-title">${message}</p>
        <p class="empty-state-detail">${detail}</p>
        ${extraDetail ? `<p class="empty-state-detail">${extraDetail}</p>` : ""}
      </div>
    `;
    comprehensiveCard.classList.add("hidden");
  };

  const renderResults = (scenarioKey, userText, options = {}) => {
    const {
      liveLaws,
      error,
      dataSource,
      guide,
      noLawOcMessage,
      situationLabel,
      nextAction,
      nextActionSource,
      detail
    } = options;
    const label = situationLabel || SCENARIO_LABELS[scenarioKey] || SCENARIO_LABELS.general;
    const excerpt = userText.substring(0, 80) + (userText.length > 80 ? "..." : "");

    comprehensiveCard.classList.remove("hidden");

    if (error || !liveLaws?.length) {
      const isMaintenance = error === "maintenance";
      const isNoOc = error === "no_law_oc";
      summaryText.innerHTML = `<strong>"${excerpt}"</strong> — <strong>[${label}]</strong> 관련 검색을 시도했으나 법령 데이터를 불러오지 못했습니다.`;

      if (isNoOc) {
        renderEmptyState(
          "korean-law-mcp 설정이 필요합니다",
          noLawOcMessage ||
            "프로젝트 루트 .env 파일에 LAW_OC(법제처 Open API 키)를 넣고 npm run dev 로 서버를 다시 실행하세요. 발급: https://open.law.go.kr"
        );
        compText.textContent =
          "Cursor에서는 .cursor/mcp.json 의 korean-law(remote URL에 ?oc=키)로 바로 조회할 수 있습니다. 웹앱은 로컬 dev 서버가 LAW_OC로 CLI를 호출합니다.";
      } else if (isMaintenance) {
        renderEmptyState(
          "법망 API 점검 중입니다",
          "보조 API(법망)만 점검 중입니다. Vercel에 LAW_OC·OPENAI_API_KEY가 설정되어 있으면 법제처 API로 조회합니다. 환경 변수 변경 후 Redeploy가 필요합니다."
        );
        compText.textContent =
          "계속 실패하면 Vercel → Settings → Environment Variables 와 Functions 타임아웃(60초)을 확인하세요.";
      } else {
        renderEmptyState(
          "관련 법령을 찾지 못했습니다",
          detail || "검색어를 바꾸거나 잠시 후 다시 시도해 주세요."
        );
        compText.textContent = guide
          ? guide.slice(0, 1500)
          : "입증 자료를 정리하고, 필요 시 대한법률구조공단(132) 등 공식 창구 상담을 검토하세요.";
        if (guide) comprehensiveCard.classList.remove("hidden");
      }
      return;
    }

    const badge =
      dataSource === "korean-law"
        ? '<span class="source-badge">korean-law-mcp (법제처 API)</span>'
        : '<span class="source-badge">법망 API</span>';
    summaryText.innerHTML = `<strong>"${excerpt}"</strong> 상황과 <strong>[${label}]</strong> 영역에 연관된 법령을 조회했습니다. ${badge}`;
    renderLawCards(liveLaws);
    renderNextAction(nextAction, nextActionSource);
    const guideEl = compText;
    guideEl.style.whiteSpace = "pre-wrap";
    guideEl.textContent = guide
      ? `${guide}\n\n— 위 내용은 참고용이며 법률 자문이 아닙니다.`
      : "위 법령 원문을 확인한 뒤, 상황에 맞는 증거를 모으고 관할 기관·전문가 상담을 검토하세요. 본 안내는 법률 자문이 아닙니다.";
  };

  const showResults = () => {
    resultsSection.removeAttribute("hidden");
    resultsSection.classList.remove("hidden");
    setTimeout(() => {
      resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const performSearch = async (inputText) => {
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    resultsSection.classList.add("hidden");
    resultsSection.setAttribute("hidden", "");

    const scenario = analyzeInputScenario(inputText);
    let renderOpts = { error: "unavailable" };

    if (typeof LawApi !== "undefined" && LawApi.fetchLiveLawCards) {
      try {
        const live = await LawApi.fetchLiveLawCards(scenario, inputText);
        if (live.ok && live.laws?.length) {
          renderOpts = {
            liveLaws: live.laws,
            dataSource: live.source,
            guide: live.guide,
            situationLabel: live.situationLabel,
            nextAction: live.nextAction,
            nextActionSource: live.nextActionSource
          };
        } else if (live.noLawOc) {
          renderOpts = {
            error: "no_law_oc",
            noLawOcMessage: live.message,
            maintenance: live.maintenance
          };
        } else if (live.maintenance) {
          renderOpts = { error: "maintenance" };
        } else if (live.koreanLawFailed || live.empty) {
          renderOpts = {
            error: "empty",
            guide: live.guide,
            detail: live.detail || live.error
          };
        }
      } catch {
        renderOpts = { error: "unavailable" };
      }
    }

    await new Promise((r) => setTimeout(r, 800));

    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
    renderResults(scenario, inputText, renderOpts);
    showResults();
  };

  situationInput.addEventListener("input", updateCharCount);

  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = situationInput.value.trim();
    if (!text) return;
    performSearch(text);
  });

  const CHIP_TEXT = {
    layoff:
      "근로계약서를 따로 서면 작성하지 않고 편의점에서 주 20시간씩 5달 동안 일했습니다. 그런데 오늘 사장님이 경영이 어렵다며 문자 한 통으로 내일부터 당장 나오지 말라고 일방적으로 해고를 통보했습니다. 어떻게 대처하고 보상받을 수 있나요?",
    rent:
      "전세 계약 만료를 3달 앞둔 시점에 집주인에게 연장하겠다고 전화를 걸었으나, 집주인이 자기가 직접 들어와 살 거라며 기간 내 무조건 비워달라고 요구합니다. 듣기로는 실거주 안 할 것 같은데 제가 임대차 갱신권을 쓸 방법이 없나요?",
    refund:
      "인터넷 사이트에서 8만 원짜리 의류 제품을 사서 이틀 전에 택배로 수령했습니다. 옷을 입어 보니 사이즈가 맞지 않아 교환이나 환불을 요구했는데 쇼핑몰 공지사항에 '세일 품목은 절대 교환/반품 불가'라고 적혀있다며 전액 거부합니다. 해결 방안이 있나요?",
    bullying:
      "입사한 지 6개월 된 신입사원입니다. 같은 부서 팀장님이 다른 팀원들이 다 보는 앞에서 수시로 '이것도 못 하냐', '머리는 폼으로 달고 다니냐'며 폭언을 하고, 퇴근 시간 이후나 주말에도 끊임없이 업무 지시 카톡을 보냅니다. 괴롭힘으로 신고하고 처벌 가능한가요?",
    salary:
      "식당에서 일하다가 지난달에 퇴사했습니다. 퇴직한 지 3주일이 다 되어가는데 사장님이 돈이 없다며 미지급 월급 150만 원과 일 년 넘게 일한 것에 대한 퇴직금 처리를 차일피일 미루고만 있습니다. 노동청에 어떻게 신고하고 지급받을 수 있나요?"
  };

  exampleChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const scenarioKey = chip.getAttribute("data-scenario");
      situationInput.value = CHIP_TEXT[scenarioKey] || "";
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

  const handleReset = () => {
    situationInput.value = "";
    updateCharCount();
    resultsSection.classList.add("hidden");
    resultsSection.setAttribute("hidden", "");
    hideNextAction();
    comprehensiveCard.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => situationInput.focus(), 600);
  };

  resetBtnTop.addEventListener("click", handleReset);
  resetBtnBottom.addEventListener("click", handleReset);

  navBtnSearch.addEventListener("click", (e) => {
    e.preventDefault();
    situationInput.focus();
    document.getElementById("search-card").scrollIntoView({ behavior: "smooth", block: "center" });
  });
});
