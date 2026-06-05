document.addEventListener("DOMContentLoaded", () => {
  const { loadSituation } = window.LawMapShared || {};

  const summaryText = document.getElementById("summary-text");
  const lawCardsList = document.getElementById("law-cards-list");
  const precCardsList = document.getElementById("prec-cards-list");
  const precedentsBlock = document.getElementById("precedents-block");
  const precListMeta = document.getElementById("prec-list-meta");
  const lawsBlock = document.getElementById("laws-block");
  const nextActionCard = document.getElementById("next-action-card");
  const nextActionText = document.getElementById("next-action-text");
  const nextActionSource = document.getElementById("next-action-source");
  const keySummaryEl = document.getElementById("key-summary");
  const situationBriefCard = document.getElementById("situation-brief-card");
  const situationBriefOpening = document.getElementById("situation-brief-opening");
  const situationBriefSections = document.getElementById("situation-brief-sections");
  const resetBtnTop = document.getElementById("reset-search-btn-top");
  const resetBtnBottom = document.getElementById("reset-search-btn-bottom");
  const toastMsg = document.getElementById("toast-msg");
  const resultsLoading = document.getElementById("results-loading");
  const resultsLoadingText = document.getElementById("results-loading-text");
  const loadingProgressBar = document.getElementById("loading-progress-bar");
  const loadingStepsEl = document.getElementById("loading-steps");
  const loadingPercentEl = document.getElementById("loading-percent");

  let loadingPhases = [
    { text: "AI가 상황을 분석하고 있습니다…", progress: 22 },
    { text: "법제처 API에서 법령·조문을 검색합니다…", progress: 50 },
    { text: "관련 판례를 조회합니다…", progress: 78 },
    { text: "판례를 쉬운 말로 요약하고 있습니다…", progress: 88 },
    { text: "상황에 맞는 핵심 안내를 작성하고 있습니다…", progress: 96 }
  ];
  let loadingPhaseTimer = null;
  let loadingPhaseIndex = 0;

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

  const setLoadingPhasesFromHints = (hints) => {
    if (!Array.isArray(hints) || hints.length < 2) return;
    const progressSteps = [22, 50, 78, 94, 98];
    loadingPhases = hints.slice(0, 4).map((text, i) => ({
      text,
      progress: progressSteps[i] || 92
    }));
  };

  const updateLoadingPhase = (index) => {
    const phase = loadingPhases[index];
    if (!phase) return;
    if (resultsLoadingText) resultsLoadingText.textContent = phase.text;
    if (loadingProgressBar) loadingProgressBar.style.width = `${phase.progress}%`;
    if (loadingPercentEl) loadingPercentEl.textContent = `${phase.progress}%`;
    if (loadingStepsEl) {
      loadingStepsEl.querySelectorAll(".loading-step").forEach((el, i) => {
        el.classList.toggle("is-active", i === index);
        el.classList.toggle("is-done", i < index);
        el.classList.toggle("is-pending", i > index);
      });
    }
    const progressRoot = loadingProgressBar?.parentElement;
    if (progressRoot) progressRoot.setAttribute("aria-valuenow", String(phase.progress));
  };

  const startLoadingAnimation = () => {
    loadingPhaseIndex = 0;
    updateLoadingPhase(0);
    if (loadingPhaseTimer) clearInterval(loadingPhaseTimer);
    loadingPhaseTimer = setInterval(() => {
      if (loadingPhaseIndex >= loadingPhases.length - 1) return;
      loadingPhaseIndex += 1;
      updateLoadingPhase(loadingPhaseIndex);
    }, 1600);
  };

  const stopLoadingAnimation = () => {
    if (loadingPhaseTimer) {
      clearInterval(loadingPhaseTimer);
      loadingPhaseTimer = null;
    }
    if (loadingProgressBar) loadingProgressBar.style.width = "100%";
    if (loadingPercentEl) loadingPercentEl.textContent = "100%";
    if (loadingStepsEl) {
      loadingStepsEl.querySelectorAll(".loading-step").forEach((el) => {
        el.classList.remove("is-active", "is-pending");
        el.classList.add("is-done");
      });
    }
  };

  const setLoading = (on) => {
    if (resultsLoading) {
      resultsLoading.classList.toggle("hidden", !on);
      resultsLoading.setAttribute("aria-busy", on ? "true" : "false");
      if (on) {
        resultsLoading.removeAttribute("hidden");
        startLoadingAnimation();
      } else {
        stopLoadingAnimation();
        resultsLoading.setAttribute("hidden", "");
      }
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

  const LAW_DESC_PREVIEW = 320;

  const bindLawExpandButtons = (root) => {
    root.querySelectorAll(".law-body-wrap.is-clamped").forEach((wrap) => {
      const btn = wrap.querySelector(".law-expand-btn");
      if (!btn || btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const expanded = wrap.classList.toggle("is-expanded");
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        btn.textContent = expanded ? "접기" : "전체 보기";
      });
    });
  };

  const buildLawBodyHtml = (text) => {
    const full = String(text || "").trim();
    if (!full) {
      return '<p class="law-body-desc law-body-desc--empty">조문 본문을 불러오지 못했습니다.</p>';
    }
    const needsClamp = full.length > LAW_DESC_PREVIEW;
    if (!needsClamp) {
      return `<p class="law-body-desc">${escapeHtml(full)}</p>`;
    }
    const preview = `${full.slice(0, LAW_DESC_PREVIEW).trim()}…`;
    return `
      <div class="law-body-wrap is-clamped">
        <p class="law-body-desc law-body-desc--preview">${escapeHtml(preview)}</p>
        <p class="law-body-desc law-body-desc--full">${escapeHtml(full)}</p>
        <button type="button" class="law-expand-btn" aria-expanded="false">전체 보기</button>
      </div>`;
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
          ${buildLawBodyHtml(law.desc || law.core || "")}
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
    bindLawExpandButtons(lawCardsList);
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
        const panel = btn.closest(".prec-accordion")?.querySelector(".prec-accordion-panel");
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
      if (meta.skipReason === "no_legal_intent" || meta.skipReason === "ai_skip") {
        precListMeta.classList.remove("hidden");
        precListMeta.removeAttribute("hidden");
        precListMeta.textContent =
          meta.skipGuidance ||
          "AI 분석 결과 이 상황에서는 판례 검색을 하지 않았습니다.";
      } else if (meta.listCount > 0 || precs?.length) {
        precListMeta.classList.remove("hidden");
        precListMeta.removeAttribute("hidden");
        if (precs?.length) {
          const searched = meta.searchedCount || meta.listCount;
          if (meta.partialMatch) {
            precListMeta.textContent = `유사 사례 ${precs.length}건 — 사실관계가 완전히 같지는 않을 수 있습니다. AI 요약과 원문을 참고하세요.`;
          } else if (searched > precs.length) {
            precListMeta.textContent = `판례 ${searched}건 중 관련 ${precs.length}건 — AI 쉬운 요약과 원문을 함께 볼 수 있습니다.`;
          } else {
            precListMeta.textContent = `판례 ${precs.length}건 — AI 쉬운 요약과 원문을 함께 볼 수 있습니다.`;
          }
        } else if (meta.listCount > 0) {
          precListMeta.textContent =
            meta.skipGuidance ||
            `판례 ${meta.listCount}건을 검색했지만, 입력하신 상황과 맞는 판례는 없었습니다.`;
        } else {
          precListMeta.textContent = "";
        }
      } else {
        precListMeta.classList.add("hidden");
      }
    }

    if (!precs?.length) {
      const emptyDetail =
        meta.skipGuidance ||
        (meta.skipReason === "no_legal_intent" || meta.skipReason === "ai_skip"
          ? "AI 분석 결과 판례 검색 대상이 아닙니다."
          : meta.listCount > 0
            ? "검색된 판례 중 상황과 관련 있는 사건을 찾지 못했습니다."
            : "판례 검색 결과가 없습니다.");
      precCardsList.innerHTML = `
        <div class="empty-state" role="status">
          <p class="empty-state-title">조건에 맞는 판례를 찾지 못했습니다</p>
          <p class="empty-state-detail">${escapeHtml(emptyDetail)}</p>
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
      const aiSummary = (prec.aiSummary || "").trim();
      const aiRelevance = (prec.aiRelevance || "").trim();
      const relevanceNote = (prec.relevanceNote || "").trim();
      const preview =
        aiSummary.slice(0, 100) ||
        judgmentOrder ||
        caseFacts.slice(0, 100) ||
        holding.slice(0, 100) ||
        "내용 펼치기";

      const aiSummaryHtml =
        aiSummary
          ? `<div class="prec-ai-summary">
              <div class="prec-ai-summary-head">
                <span class="prec-ai-badge">AI 쉬운 요약</span>
                <span class="prec-ai-disclaimer">참고용 · 법률 자문 아님</span>
              </div>
              <p class="prec-ai-text">${escapeHtml(aiSummary)}</p>
              ${aiRelevance ? `<p class="prec-ai-relevance"><strong>내 상황과:</strong> ${escapeHtml(aiRelevance)}</p>` : ""}
              ${relevanceNote ? `<p class="prec-match-note">관련성: ${escapeHtml(relevanceNote)}</p>` : ""}
            </div>`
          : "";

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
        ${aiSummaryHtml}
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
          <p class="prec-original-label">판례 원문</p>
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

  const hideSituationBrief = () => {
    if (!situationBriefCard) return;
    situationBriefCard.classList.add("hidden");
    situationBriefCard.setAttribute("hidden", "");
    if (situationBriefOpening) situationBriefOpening.textContent = "";
    if (situationBriefSections) situationBriefSections.innerHTML = "";
  };

  const renderSituationBrief = (brief) => {
    if (!situationBriefCard || !situationBriefSections) return;
    if (!brief || typeof brief !== "object") {
      hideSituationBrief();
      return;
    }

    const sections = [
      { title: "핵심 요약", body: brief.coreSummary },
      { title: "지금 가장 중요한 것", body: brief.evidenceFocus },
      { title: "지금 할 일", body: brief.actionSteps }
    ].filter((s) => s.body && String(s.body).trim());

    if (!brief.opening && !sections.length) {
      hideSituationBrief();
      return;
    }

    if (situationBriefOpening) {
      situationBriefOpening.textContent = brief.opening || "";
      situationBriefOpening.classList.toggle("hidden", !brief.opening);
    }

    situationBriefSections.innerHTML = sections
      .map(
        (s) => `
        <section class="situation-brief-section">
          <h4 class="situation-brief-section-title">${escapeHtml(s.title)}</h4>
          <p class="situation-brief-section-body">${escapeHtml(s.body)}</p>
        </section>`
      )
      .join("");

    if (brief.extraNote) {
      situationBriefSections.insertAdjacentHTML(
        "beforeend",
        `<p class="situation-brief-extra">${escapeHtml(brief.extraNote)}</p>`
      );
    }

    situationBriefCard.classList.remove("hidden");
    situationBriefCard.removeAttribute("hidden");
  };

  const hideKeySummary = () => {
    if (!keySummaryEl) return;
    keySummaryEl.textContent = "";
    keySummaryEl.classList.add("hidden");
    keySummaryEl.setAttribute("hidden", "");
  };

  const renderKeySummary = (text) => {
    if (!keySummaryEl) return;
    const lines = String(text || "")
      .trim()
      .split("\n")
      .filter(Boolean);
    if (!lines.length) {
      hideKeySummary();
      return;
    }
    keySummaryEl.innerHTML = lines
      .map((line) => `<span class="key-summary-line">${escapeHtml(line)}</span>`)
      .join("");
    keySummaryEl.classList.remove("hidden");
    keySummaryEl.removeAttribute("hidden");
  };

  const buildKeySummaryFromCards = (laws, precs) => {
    const lines = [];
    if (laws?.length) {
      const top = laws.slice(0, 3).map((l) => `${l.name} ${l.clause || ""}`.trim());
      lines.push(`법령 ${laws.length}건 — ${top.join(" · ")}`);
    }
    if (precs?.length) {
      const top = precs.slice(0, 2).map((p) => {
        const court = p.clause && String(p.clause).split("·")[0]?.trim();
        return [p.name, court].filter(Boolean).join(" ");
      });
      lines.push(`판례 ${precs.length}건 — ${top.join(" · ")}`);
    }
    return lines.join("\n");
  };

  const hideNextAction = () => {
    if (!nextActionCard) return;
    nextActionCard.classList.add("hidden");
    nextActionCard.setAttribute("hidden", "");
  };

  const renderNextAction = (text, source) => {
    if (!nextActionCard || !nextActionText) return;
    const action = (text && String(text) !== "undefined" ? text : "").trim();
    if (!action) {
      hideNextAction();
      return;
    }
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
    hideSituationBrief();
    if (precedentsBlock) {
      precedentsBlock.classList.add("hidden");
      precedentsBlock.setAttribute("hidden", "");
    }
    lawCardsList.innerHTML = `
      <div class="empty-state" role="alert">
        <p class="empty-state-title">${escapeHtml(message)}</p>
        <p class="empty-state-detail">${escapeHtml(detail)}</p>
        ${extraDetail ? `<p class="empty-state-detail">${escapeHtml(extraDetail)}</p>` : ""}
      </div>
    `;
    hideKeySummary();
  };

  const renderResults = (userText, options = {}) => {
    const {
      liveLaws,
      livePrecedents,
      precListCount,
      precSearchedCount,
      precSkipReason,
      precSkipGuidance,
      error,
      keySummary,
      noLawOcMessage,
      noOpenAiMessage,
      situationLabel,
      situationSummary,
      situationBrief,
      nextAction,
      nextActionSource,
      detail
    } = options;
    const label = situationLabel || "일반";
    const fullQuestion = escapeHtml(userText.trim());

    hideKeySummary();

    const hasLaws = liveLaws?.length > 0;
    const hasPrecs = livePrecedents?.length > 0;

    if (error || (!hasLaws && !hasPrecs)) {
      const isNoOc = error === "no_law_oc";
      const isNoAi = error === "no_openai_key";
      summaryText.innerHTML = situationSummary
        ? `<strong>"${fullQuestion}"</strong> — ${escapeHtml(situationSummary)}`
        : `<strong>"${fullQuestion}"</strong> — <strong>[${escapeHtml(label)}]</strong> 관련 검색을 완료하지 못했습니다.`;

      if (isNoOc) {
        renderEmptyState("법제처 API 설정이 필요합니다", noLawOcMessage || detail || "");
      } else if (isNoAi) {
        renderEmptyState("OpenAI API 설정이 필요합니다", noOpenAiMessage || detail || "");
      } else {
        renderEmptyState(
          error === "no_legal_intent" ? "법적 분쟁 상황으로 보기 어렵습니다" : "관련 법령을 찾지 못했습니다",
          detail || precSkipGuidance || "상황을 더 구체적으로 적어 보세요."
        );
      }
      return;
    }

    const badge = '<span class="source-badge">AI + 법제처 Open API</span>';
    const parts = [];
    if (hasLaws) parts.push("법령");
    if (hasPrecs) parts.push("판례");
    const precNote =
      hasPrecs
        ? ""
        : precSkipReason === "no_legal_intent" || precSkipReason === "ai_skip"
          ? " (판례 미검색)"
          : precSkipReason === "no_relevant_match"
            ? " (판례는 검색했으나 관련 사례 없음)"
            : " (판례는 별도 검색·법령과 사건 구조가 다릅니다)";
    summaryText.innerHTML = `<strong>"${fullQuestion}"</strong> 상황과 <strong>[${escapeHtml(label)}]</strong> 영역에 연관된 ${parts.join("·") || "자료"}을(를) 조회했습니다${precNote}. ${badge}`;
    if (lawsBlock) lawsBlock.classList.toggle("hidden", !hasLaws);
    renderSituationBrief(situationBrief);
    renderLawCards(hasLaws ? liveLaws : []);
    renderPrecCards(livePrecedents || [], {
      listCount: options.precListCount || livePrecedents?.length || 0,
      searchedCount: options.precSearchedCount,
      skipReason: options.precSkipReason,
      skipGuidance: options.precSkipGuidance,
      partialMatch: options.precPartialMatch
    });
    if (situationBrief?.actionSteps) {
      hideNextAction();
    } else {
      renderNextAction(nextAction, nextActionSource);
    }
    renderKeySummary(
      keySummary || buildKeySummaryFromCards(liveLaws, livePrecedents)
    );
  };

  const performSearch = async () => {
    setLoading(true);
    summaryText.textContent = "AI가 상황을 분석하고 법령·판례를 조회합니다…";

    let renderOpts = {
      error: "unavailable",
      detail: "서버에 연결하지 못했습니다. npm run dev 로 서버를 실행했는지 확인하세요."
    };

    if (typeof LawApi !== "undefined" && LawApi.fetchLiveLawCards) {
      try {
        const live = await LawApi.fetchLiveLawCards(null, inputText);

        if (live.loadingHints) setLoadingPhasesFromHints(live.loadingHints);

        if (live.ok && (live.laws?.length || live.precedents?.length)) {
          renderOpts = {
            liveLaws: live.laws || [],
            livePrecedents: live.precedents || [],
            precListCount: live.precListCount,
            precSearchedCount: live.precSearchedCount,
            precSkipReason: live.precSkipReason,
            precSkipGuidance: live.precSkipGuidance,
            precPartialMatch: live.precPartialMatch,
            keySummary: live.keySummary,
            situationLabel: live.situationLabel,
            situationSummary: live.situationSummary,
            situationBrief: live.situationBrief,
            nextAction: live.nextAction,
            nextActionSource: live.nextActionSource
          };
        } else if (live.noLawOc) {
          renderOpts = {
            error: "no_law_oc",
            noLawOcMessage: live.message,
            detail: live.message
          };
        } else if (live.noOpenAi) {
          renderOpts = {
            error: "no_openai_key",
            noOpenAiMessage: live.message,
            detail: live.message
          };
        } else {
          renderOpts = {
            error: live.error || "empty",
            situationLabel: live.situationLabel,
            situationSummary: live.situationSummary,
            detail: live.detail || live.message,
            precListCount: live.precListCount,
            precSearchedCount: live.precSearchedCount,
            precSkipReason: live.precSkipReason,
            precSkipGuidance: live.precSkipGuidance
          };
        }
      } catch {
        renderOpts = {
          error: "unavailable",
          detail: "검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
        };
      }
    }

    setLoading(false);
    renderResults(inputText, renderOpts);
  };

  const goHome = () => {
    window.location.href = "index.html#search-section";
  };

  resetBtnTop.addEventListener("click", goHome);
  resetBtnBottom.addEventListener("click", goHome);

  performSearch();
});
