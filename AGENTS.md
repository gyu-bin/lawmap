# LawMap (로맵) — 에이전트 가이드

상황 기반 법령 안내 정적 웹앱입니다. 법률 자문이 아닌 정보 제공 목적입니다.

## 법령 데이터 소스 (우선순위)

1. **Cursor MCP `korean-law`** — `https://korean-law-mcp.fly.dev/mcp` (기본, `LAW_OC` 불필요)
2. **로컬 `korean-law-mcp`** — `LAW_OC` 필요 (`.cursor/mcp.local.example.json`)
3. **Fallback `beopmang`** — `https://api.beopmang.org/mcp` 또는 REST

규칙: `.cursor/rules/korean-law-search.mdc` · 상세: `docs/korean-law-search.md`

## 저장소 구조

| 경로 | 설명 |
|------|------|
| `index.html`, `home.js`, `index.css` | 홈(검색 입력·예시·가이드) |
| `results.html`, `results.js` | 법령 검색 결과 전용 페이지 |
| `law-api.js` | 브라우저용 법망 REST 클라이언트 (korean-law-mcp 대체 불가 → REST fallback) |
| `.cursor/mcp.json` | 프로젝트 MCP 서버 설정 |
| `scripts/smoke-law-apis.sh` | API 연결 스모크 테스트 |

## 개발 시

- 법령·조문·판례 조회: MCP `korean-law` 도구 먼저, 실패 시 `beopmang`
- 웹 검색: `results.js` + `law-api.js` → `/api/law/search` (법제처 API)
- 새 크롤러·별도 법령 패키지 추가 금지

## 스모크 테스트

```bash
./scripts/smoke-law-apis.sh
```
