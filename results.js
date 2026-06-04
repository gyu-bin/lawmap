document.addEventListener("DOMContentLoaded", () => {
  const { SCENARIO_LABELS, analyzeInputScenario, loadSituation } =
    window.LawMapShared || {};

  const summaryText = document.getElementById("summary-text");
  const lawCardsList = document.getElementById("law-cards-list");
  const precCardsList = document.getElementById("prec-cards-list");
  const precedentsBlock = document.getElementById("precedents-block");
  const precListMeta = document.getElementById("prec-list-meta");
  const lawsBlock = document.getElementById("laws-block");
  const nextActionCard = document.getElementById("next-action-card");
  const nextActionText = document.getElementById("next-action-text");
  const nextActionSource = document.getElementById("next-action-source");
  const compText = document.getElementById("comp-text");
  const comprehensiveCard = document.getElementById("comprehensive-card");
  const resetBtnTop = document.getElementById("reset-search-btn-top");
  const resetBtnBottom = document.getElementById("reset-search-btn-bottom");
  const toastMsg = document.getElementById("toast-msg");
  const resultsLoading = document.getElementById("results-loading");

  const inputText = (loadSituation && loadSituation()) || "";
  if (!inputText.trim()) {
    window.location.replace("index.html");
    return;
  }

  const showToast = (message) => {
    if (!toastMsg) return;
    toastMsg.textContent = message;
    toastMsg.classList.add("show");
    setTimeout(() => toastMsg.classList.remove("show"), 2000);
  };

  const setLoading = (on) => {
    if (resultsLoading) {
      resultsLoading.classList.toggle("hidden", !on);
      if (on) resultsLoading.removeAttribute("hidden");
      else resultsLoading.setAttribute("hidden", "");
    }
    document.body.classList.toggle("is-searching", on);
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const bindCopyButtons = (root) => {
    root.querySelectorAll(".copy-btn").forEach((btn) => {
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
    if (!lawCardsList) return;
    lawCardsList.innerHTML = "";
    if (!laws?.length) {
      lawCardsList.innerHTML =
        '<p class="subsection-empty">관련 법령 조문을 찾지 못했습니다.</p>';
      return;
    }
    laws.forEach((law) => {
      const card = document.createElement("article");
      card.className = "law-card";
      const copyText = `${law.name} ${law.clause}: ${law.core || law.desc || ""}`;
      const safeCopy = copyText.replace(/"/g, "&quot;");
      card.innerHTML = `
        <div class="law-card-header">
          <div class="header-left">
            <span class="num-badge">${law.num}</span>
            <div class="law-title-group">
              <span class="law-name">${escapeHtml(law.name)}</span>
              <h4 class="clause-name">${escapeHtml(law.clause)}</h4>
            </div>
          </div>
          <span class="relevance-badge">${escapeHtml(law.relevance)}</span>
        </div>
        <div class="divider"></div>
        <div class="core-box">
          <span class="core-title">조문 원문 (법제처 API)</span>
          <p class="law-body-desc">${escapeHtml(law.desc || law.core || "")}</p>
        </div>
        <div class="law-card-footer">
          <a href="${escapeHtml(law.link)}" target="_blank" rel="noopener noreferrer" class="official-link">
            법제처 법령 정보 원문 보기
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
          <button type="button" class="copy-btn" data-copy-text="${safeCopy}">
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
    bindCopyButtons(lawCardsList);
  };

  const splitReadableChunks = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return [];

    let normalized = raw
      .replace(/\r\n/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/\s{3,}/g, "\n\n")
      .replace(/\.(\s+)(?=[가-힣①-⑨\d(「])/g, ".\n\n")
      .replace(/([다요임음니다한다된다있없아니]\.)\s+(?=[가-힣①-⑨\d(「])/g, "$1\n\n");

    let parts = normalized
      .split(/\n{2,}|\n+/)
      .flatMap((block) =>
        block
          .split(/(?=\s*[①-⑨]\s)|(?=\s*\d+\)\s)|(?=\s*[가나다]\.\s)/)
          .map((s) => s.trim())
      )
      .filter((s) => s.length > 12);

    if (parts.length <= 1) {
      const sentences =
        raw.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]{40,}(?=\s|$)/g) || [];
      parts = sentences.map((s) => s.trim()).filter((s) => s.length > 12);
    }

    const merged = [];
    let buf = "";
    const maxLen = 220;
    for (const s of parts) {
      if (!buf) {
        buf = s;
        continue;
      }
      if (buf.length + s.length <= maxLen) {
        buf = `${buf} ${s}`;
      } else {
        merged.push(buf);
        buf = s;
      }
    }
    if (buf) merged.push(buf);

    return merged.length ? merged : [raw];
  };

  const formatPrecParagraphs = (text) => {
    const chunks = splitReadableChunks(text);
    if (!chunks.length) return "";
    return chunks.map((s) => `<p class="prec-p">${escapeHtml(s)}</p>`).join("");
  };

  const bindPrecAccordions = () => {
    precCardsList.querySelectorAll(".prec-accordion-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.nextElementSibling;
        if (!panel) return;
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        panel.hidden = open;
        btn.classList.toggle("is-open", !open);
      });
    });
  };

  const normalizePrec = (prec) => {
    const p = { ...prec };
    if (!p.link || p.link.includes("/판례/")) {
      const id = p.precId || (p.link && p.link.match(/precSeq=(\d+)/)?.[1]);
      if (id) {
        p.link = `https://www.law.go.kr/precInfoP.do?precSeq=${encodeURIComponent(id)}`;
      }
    }
    if (!p.holding && !p.gist && p.desc) {
      const parts = String(p.desc).split(/\n\n+/).filter(Boolean);
      if (parts.length >= 2) {
        p.holding = parts[0];
        p.gist = parts.slice(1).join("\n\n");
      } else {
        p.holding = p.desc;
      }
    }
    return p;
  };

  const renderPrecCards = (precs, meta = {}) => {
    if (!precCardsList || !precedentsBlock) return;
    precedentsBlock.classList.remove("hidden");
    precedentsBlock.removeAttribute("hidden");

    if (precListMeta) {
      if (meta.listCount > 0 || precs?.length) {
        precListMeta.classList.remove("hidden");
        precListMeta.removeAttribute("hidden");
        precListMeta.textContent = meta.listCount
          ? `판례 목록 API에서 ${meta.listCount}건을 찾았고, 그중 ${precs?.length || 0}건의 사건·주문·이유를 표시합니다.`
          : "";
      } else {
        precListMeta.classList.add("hidden");
      }
    }

    if (!precs?.length) {
      precCardsList.innerHTML = `
        <div class="empty-state" role="status">
          <p class="empty-state-title">조건에 맞는 판례를 찾지 못했습니다</p>
          <p class="empty-state-detail">판례는 법령과 별도 API(target=prec)입니다. 검색어를 바꾸거나 위 「관련 법령」 조문을 먼저 확인해 보세요.</p>
        </div>`;
      return;
    }
    precCardsList.innerHTML = "";
    precs.forEach((raw, index) => {
      const prec = normalizePrec(raw);
      const card = document.createElement("article");
      card.className = "law-card law-card--prec prec-accordion";
      const holding = prec.holding || "";
      const gist = prec.gist || "";
      const caseFacts = prec.caseFacts || "";
      const judgmentOrder = prec.judgmentOrder || "";
      const courtAnalysis = prec.courtAnalysis || "";
      const isFirst = index === 0;
      const preview = judgmentOrder || caseFacts.slice(0, 100) || holding.slice(0, 100) || "내용 펼치기";

      const precSection = (label, text, open = false) => {
        if (!text || !String(text).trim()) return "";
        const preview = splitReadableChunks(text)[0] || "";
        const shortPreview =
          preview.length > 72 ? `${preview.slice(0, 72)}…` : preview;
        return `
          <details class="prec-section" ${open ? "open" : ""}>
            <summary class="prec-section-summary">
              <span class="prec-section-label">${label}</span>
              <span class="prec-section-hint">${escapeHtml(shortPreview)}</span>
            </summary>
            <div class="prec-section-body">${formatPrecParagraphs(text)}</div>
          </details>`;
      };

      const copyText = [
        prec.name,
        prec.clause,
        caseFacts && `【사건】\n${caseFacts}`,
        judgmentOrder && `【판결 결과(주문)】\n${judgmentOrder}`,
        holding && `【판시사항】\n${holding}`,
        gist && `【판결요지】\n${gist}`,
        courtAnalysis && `【법원 판단】\n${courtAnalysis}`
      ]
        .filter(Boolean)
        .join("\n\n");
      const safeCopy = copyText.replace(/"/g, "&quot;");
      const refLines = [
        prec.refLaws ? `<p class="prec-ref">참조조문: ${escapeHtml(prec.refLaws)}</p>` : "",
        prec.refCases ? `<p class="prec-ref">참조판례: ${escapeHtml(prec.refCases)}</p>` : ""
      ].join("");

      const bodyHtml = [
        precSection("사건 (공소사실·쟁점)", caseFacts, isFirst),
        precSection("판결 결과 (주문)", judgmentOrder, isFirst),
        precSection("판시사항 (법리)", holding, false),
        precSection("판결요지", gist, false),
        precSection("법원 판단 (이유·결론)", courtAnalysis, false)
      ].join("");

      card.innerHTML = `
        <button type="button" class="prec-accordion-toggle ${isFirst ? "is-open" : ""}" aria-expanded="${isFirst ? "true" : "false"}">
          <div class="prec-accordion-head">
            <span class="num-badge num-badge--prec">${prec.num}</span>
            <div class="prec-accordion-titles">
              <span class="law-name">${escapeHtml(prec.name)}</span>
              <span class="clause-name">${escapeHtml(prec.clause)}</span>
              <span class="prec-accordion-preview">${escapeHtml(preview)}${preview.length >= 100 ? "…" : ""}</span>
            </div>
          </div>
          <span class="prec-accordion-icon" aria-hidden="true"></span>
        </button>
        <div class="prec-accordion-panel" ${isFirst ? "" : "hidden"}>
          <div class="prec-sections">
            ${bodyHtml}
          </div>
          ${refLines ? `<div class="prec-refs">${refLines}</div>` : ""}
          <div class="law-card-footer prec-card-footer">
            <a href="${escapeHtml(prec.link)}" target="_blank" rel="noopener noreferrer" class="official-link">
              법제처 판례 원문 보기
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
            <button type="button" class="copy-btn" data-copy-text="${safeCopy}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>복사하기</span>
            </button>
          </div>
        </div>
      `;
      precCardsList.appendChild(card);
    });
    bindPrecAccordions();
    bindCopyButtons(precCardsList);
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
    if (precedentsBlock) {
      precedentsBlock.classList.add("hidden");
      precedentsBlock.setAttribute("hidden", "");
    }
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
      livePrecedents,
      precListCount,
      error,
      dataSource,
      guide,
      noLawOcMessage,
      situationLabel,
      nextAction,
      nextActionSource,
      detail
    } = options;
    const label =
      situationLabel ||
      (SCENARIO_LABELS && SCENARIO_LABELS[scenarioKey]) ||
      (SCENARIO_LABELS && SCENARIO_LABELS.general) ||
      "일반";
    const excerpt = userText.substring(0, 80) + (userText.length > 80 ? "..." : "");

    comprehensiveCard.classList.remove("hidden");

    const hasLaws = liveLaws?.length > 0;
    const hasPrecs = livePrecedents?.length > 0;

    if (error || (!hasLaws && !hasPrecs)) {
      const isMaintenance = error === "maintenance";
      const isNoOc = error === "no_law_oc";
      summaryText.innerHTML = `<strong>"${excerpt}"</strong> — <strong>[${label}]</strong> 관련 검색을 시도했으나 법령 데이터를 불러오지 못했습니다.`;

      if (isNoOc) {
        renderEmptyState(
          "법제처 API 설정이 필요합니다",
          noLawOcMessage ||
            "프로젝트 루트 .env 파일에 LAW_OC(법제처 Open API 키)를 넣고 npm run dev 로 서버를 다시 실행하세요. 발급: https://open.law.go.kr"
        );
        compText.textContent =
          "Vercel 배포 시 Environment Variables에 LAW_OC를 설정한 뒤 Redeploy하세요.";
      } else if (isMaintenance) {
        renderEmptyState(
          "법망 API 점검 중입니다",
          "보조 API(법망)만 점검 중입니다. Vercel에 LAW_OC·OPENAI_API_KEY가 설정되어 있으면 법제처 API로 조회합니다."
        );
        compText.textContent =
          "계속 실패하면 Vercel → Settings → Environment Variables 를 확인하세요.";
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
        ? '<span class="source-badge">법제처 Open API</span>'
        : '<span class="source-badge">법망 API</span>';
    const parts = [];
    if (hasLaws) parts.push("법령");
    if (hasPrecs) parts.push("판례");
    const precNote = hasPrecs
      ? ""
      : " (판례는 별도 검색·법령과 사건 구조가 다릅니다)";
    summaryText.innerHTML = `<strong>"${excerpt}"</strong> 상황과 <strong>[${label}]</strong> 영역에 연관된 ${parts.join("·") || "자료"}을(를) 조회했습니다${precNote}. ${badge}`;
    if (lawsBlock) lawsBlock.classList.toggle("hidden", !hasLaws);
    renderLawCards(hasLaws ? liveLaws : []);
    renderPrecCards(livePrecedents || [], {
      listCount: options.precListCount || livePrecedents?.length || 0
    });
    renderNextAction(nextAction, nextActionSource);
    compText.style.whiteSpace = "pre-wrap";
    compText.textContent = guide
      ? `${guide}\n\n— 위 내용은 참고용이며 법률 자문이 아닙니다.`
      : "위 법령 원문을 확인한 뒤, 상황에 맞는 증거를 모으고 관할 기관·전문가 상담을 검토하세요. 본 안내는 법률 자문이 아닙니다.";
  };

  const performSearch = async () => {
    setLoading(true);
    summaryText.textContent =
      "법제처 API에서 관련 법령·조문·판례를 조회하고 있습니다…";

    const scenario = analyzeInputScenario
      ? analyzeInputScenario(inputText)
      : "general";
    let renderOpts = { error: "unavailable" };

    if (typeof LawApi !== "undefined" && LawApi.fetchLiveLawCards) {
      try {
        const live = await LawApi.fetchLiveLawCards(scenario, inputText);
        if (live.ok && (live.laws?.length || live.precedents?.length)) {
          renderOpts = {
            liveLaws: live.laws || [],
            livePrecedents: live.precedents || [],
            precListCount: live.precListCount,
            dataSource: live.source,
            guide: live.guide,
            situationLabel: live.situationLabel,
            nextAction: live.nextAction,
            nextActionSource: live.nextActionSource
          };
        } else if (live.situationLabel && (live.koreanLawFailed || live.empty)) {
          renderOpts = {
            error: "empty",
            situationLabel: live.situationLabel,
            guide: live.guide,
            detail:
              live.detail ||
              "조문 본문을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
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

    setLoading(false);
    renderResults(scenario, inputText, renderOpts);
  };

  const goHome = () => {
    window.location.href = "index.html#search-section";
  };

  resetBtnTop.addEventListener("click", goHome);
  resetBtnBottom.addEventListener("click", goHome);

  performSearch();
});
