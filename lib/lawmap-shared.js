/**
 * LawMap 공통 (홈 · 결과 페이지)
 */
(function (global) {
  const SCENARIO_LABELS = {
    layoff: "근로·해고",
    rent: "임대차",
    refund: "환불·전자상거래",
    bullying: "직장 내 괴롭힘",
    salary: "임금·퇴직금",
    overtime: "야근·주말근무",
    general: "일반"
  };

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

  const SITUATION_STORAGE_KEY = "lawmap:situation";

  function analyzeInputScenario(text) {
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
  }

  function saveSituation(text) {
    try {
      sessionStorage.setItem(SITUATION_STORAGE_KEY, text.trim());
    } catch {
      /* ignore quota errors */
    }
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

  global.LawMapShared = {
    SCENARIO_LABELS,
    CHIP_TEXT,
    SITUATION_STORAGE_KEY,
    analyzeInputScenario,
    saveSituation,
    loadSituation,
    clearSituation
  };
})(typeof window !== "undefined" ? window : globalThis);
