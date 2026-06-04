# LawMap × korean-law-mcp 사용법

공식 저장소: [chrisryugj/korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)

## LawMap 웹에서 (로맵 사용자)

| 단계 | 내용 |
|------|------|
| 0 | [법제처 Open API](https://open.law.go.kr) 에서 **OC 인증키** 발급 |
| 1 | 프로젝트 `.env` 에 `LAW_OC=발급키` 저장 |
| 2 | `npm install` 후 **`npm run dev`** (Express + CLI 프록시) |
| 3 | **http://localhost:3000** 에서 검색 (`serve` 단독 사용 X) |

웹은 MCP가 아니라 서버가 **`korean-law search_law` → `get_law_text`** 를 호출합니다.

## Cursor에서 (개발·고급 조회)

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "korean-law": {
      "url": "https://korean-law-mcp.fly.dev/mcp?oc=본인_OC_키"
    }
  }
}
```

**OC 없이 URL만 넣으면 검색이 안 될 수 있습니다.** README 방법 2·3과 동일합니다.

## 방법별 정리 (README 요약)

| 방법 | 대상 | OC 전달 |
|------|------|---------|
| 1 Claude Code 플러그인 | Claude Code | 설치 시 입력 |
| 2 Claude.ai 커넥터 | 웹 Claude | `?oc=키` |
| 3 Cursor / Windsurf | IDE | `?oc=키` 또는 `LAW_OC` |
| 4 로컬 MCP | 오프라인·직접 | `env.LAW_OC` |
| 5 CLI | 터미널 | `export LAW_OC=키` |
| **LawMap** | 브라우저 | `.env` → `npm run dev` |

## 상황 검색 시 권장 도구 (README)

- **법령명·조문**: `search_law` → `get_law_text`
- **애매한 상황 문장**: `korean-law query "…"` (자연어 라우팅)
- **종합 리서치**: `chain_full_research` — 키워드가 넓으면 **관련성 낮은 조문**이 섞일 수 있음
- **판례**: `search_precedents` (키워드는 짧게, 예: `물웅덩이`)

LawMap은 물벼락 등 일부 상황에 **조회 경로**(어떤 법령·몇 조를 `search_law` → `get_law_text`로 불러올지)만 고정하고, 조문 제목·본문 요약은 **법제처 API 응답**을 그대로 씁니다.

## OpenAI（지금 할 일）

`.env`에 `OPENAI_API_KEY`를 넣으면, 조회된 조문 목록·사용자 상황만 넣어 **「지금 할 일」** 한 단락을 생성합니다. 법령 카드 본문은 OpenAI를 쓰지 않습니다.

```env
OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-5.4-mini
```

키가 없거나 API 오류 시 playbook/기본 문구로 fallback 합니다.

## 법망 fallback

`korean-law-mcp`·`LAW_OC` 가 없거나 장애 시에만 `https://api.beopmang.org` 사용.
