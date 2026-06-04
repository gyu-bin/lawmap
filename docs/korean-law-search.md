# 한국 법령 검색 가이드

## 이 기능으로 할 수 있는 일

- `korean-law-mcp` 로 법령명 검색
- 특정 법령의 조문 본문 조회
- 판례 / 유권해석 / 자치법규 검색
- MCP 또는 CLI 경로 중 현재 환경에 맞는 방식 선택
- 기존 경로 장애 시 `법망` fallback으로 이어가기

## 가장 중요한 규칙

한국 법령 관련 검색/조회가 필요할 때는 **`korean-law-mcp`를 먼저 사용**합니다.
기존 서비스가 동작하지 않을 때만 승인된 fallback 표면인 **`법망`(`https://api.beopmang.org`)** 으로 전환합니다.
별도 repo package, 별도 python package, 임의 크롤러를 새로 만들지 않습니다.

## 먼저 필요한 것

- 인터넷 연결
- `node` 18+
- `npm install -g korean-law-mcp` (로컬 CLI/로컬 MCP server 경로일 때)
- remote MCP endpoint를 쓸 MCP 클라이언트
- `법망` fallback (`https://api.beopmang.org`) 에 접근할 수 있는 네트워크

무료 API key 발급처: `https://open.law.go.kr`

로컬 CLI 또는 로컬 MCP server 경로는 `LAW_OC` 가 필요합니다.
remote MCP endpoint는 사용자 `LAW_OC` 없이 `url`만으로 연결합니다.

```bash
npm install -g korean-law-mcp
export LAW_OC=your-api-key

korean-law list
korean-law help search_law
```

로컬 설치가 막히면 먼저 `https://korean-law-mcp.fly.dev/mcp` remote endpoint를 사용합니다. 그 경로도 응답하지 않거나 서비스 장애가 나면 `법망`(`https://api.beopmang.org`) MCP/REST를 fallback으로 사용합니다.

## MCP 연결 예시

프로젝트 기본값: `.cursor/mcp.json` (remote + 법망 fallback)

로컬 OC 키 사용 시: `.cursor/mcp.local.example.json` 내용을 참고해 `.cursor/mcp.json`을 교체하거나 병합합니다.

```json
{
  "mcpServers": {
    "korean-law": {
      "command": "korean-law-mcp",
      "env": {
        "LAW_OC": "your-api-key"
      }
    }
  }
}
```

remote endpoint 예시:

```json
{
  "mcpServers": {
    "korean-law": {
      "url": "https://korean-law-mcp.fly.dev/mcp"
    }
  }
}
```

## fallback: 법망

```json
{
  "mcpServers": {
    "beopmang": {
      "url": "https://api.beopmang.org/mcp"
    }
  }
}
```

```bash
curl "https://api.beopmang.org/api/v4/law?action=search&q=관세법"
curl "https://api.beopmang.org/api/v4/tools?action=overview&law_id=001706"
curl "https://api.beopmang.org/api/v4/law?action=get&law_id=001706&article=제750조"
```

## 기본 흐름

1. 질의 분류 (법령/판례/행정해석/자치법규)
2. 법령명 → `search_law`
3. 조문 → 식별자(`mst`) 확인 후 `get_law_text`
4. 판례/유권해석/자치법규 → 각 전용 도구
5. 애매하면 `search_all`
6. korean-law-mcp 장애 시 법망 fallback
7. 0건이어도 검색어·범주 재확인

## LawMap 웹앱

정적 브라우저에서는 MCP/CLI를 직접 쓸 수 없습니다. `law-api.js`가 **법망 REST**로만 검색하며, 실패·점검 시 `index.js`에 안내 메시지만 표시합니다 (하드코딩 mock 없음).

## 라이브 확인 메모

- `korean-law list`, `korean-law help search_law` — CLI 진입 검증됨
- remote MCP: `LAW_OC` 없이 URL 등록만으로 연결
- 장애 시: `https://api.beopmang.org/mcp` 또는 `/api/v4/law?action=search`
