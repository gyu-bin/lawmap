/**
 * 상황 → 법제처 API 조회 경로만 정의 (법령 본문·조문명은 search_law / get_law_text 결과 사용)
 * 데이터를 쌓는 DB가 아님. 하드코딩된 조문 해설·할 일 문구는 두지 않습니다.
 */

const SITUATION_ROUTES = {
  splash: {
    label: "차량 물벼락·물웅덩이 피해",
    /** OpenAI 실패 시 fallback (법령 본문과 무관) */
    nextAction:
      "차량 번호·시각·장소·목격·피해 사진을 남기고, 가해 차량 보험사 또는 경찰(112)·법률구조(132) 상담을 검토하세요.",
    articles: [
      { lawQuery: "민법", jo: "제750조" },
      { lawQuery: "도로교통법", jo: "제48조" },
      { lawQuery: "민법", jo: "제751조", optional: true }
    ]
  },

  selfDefense: {
    label: "정당방위·강도 등 위협",
    nextAction:
      "위협 경위·시각·장소를 기록하고, 경찰(112)·법률구조(132) 상담을 검토하세요. 정당방위 성립 여부는 구체 사실관계에 따라 달라집니다.",
    articles: [
      { lawQuery: "형법", jo: "제21조" },
      { lawQuery: "형법", jo: "제22조", optional: true }
    ]
  },

  overtime: {
    label: "프리랜서·야근·주말근무",
    nextAction:
      "계약서·근무지시(카톡·메일)·출퇴근·야근 기록을 모으고, 지방고용노동지청(1350) 또는 노무사·법률구조(132) 상담을 검토하세요.",
    articles: [
      { lawQuery: "근로기준법", jo: "제2조" },
      { lawQuery: "근로기준법", jo: "제50조" },
      { lawQuery: "근로기준법", jo: "제53조" },
      { lawQuery: "근로기준법", jo: "제56조" },
      { lawQuery: "근로기준법", jo: "제55조", optional: true }
    ]
  }
};

function detectPlaybook(userText) {
  const t = (userText || "").trim();

  if (
    (t.includes("물") && (t.includes("벼락") || t.includes("웅덩") || t.includes("보라"))) ||
    (t.includes("자동차") && t.includes("물") && (t.includes("맞") || t.includes("튀")))
  ) {
    return SITUATION_ROUTES.splash;
  }

  const laborWork =
    t.includes("야근") ||
    t.includes("연장근로") ||
    t.includes("휴일근무") ||
    (t.includes("주말") && (t.includes("일") || t.includes("근무") || t.includes("출근"))) ||
    t.includes("철야");

  const freelancer = t.includes("프리랜서") || t.includes("프리 랜서") || t.includes("도급");

  if (laborWork || (freelancer && (t.includes("근무") || t.includes("야근") || t.includes("주말")))) {
    return SITUATION_ROUTES.overtime;
  }

  if (
    t.includes("정당방위") ||
    t.includes("강도") ||
    t.includes("자기방어") ||
    t.includes("자기 방어") ||
    t.includes("생명의 위협") ||
    (t.includes("침입") && (t.includes("집") || t.includes("침해") || t.includes("위협"))) ||
    (t.includes("방어") && (t.includes("강도") || t.includes("침입") || t.includes("위협")))
  ) {
    return SITUATION_ROUTES.selfDefense;
  }

  return null;
}

module.exports = { SITUATION_ROUTES, detectPlaybook };
