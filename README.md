# 한국 법령/행정규칙 변경 모니터 MVP

한국 정부의 법령, 행정규칙, 관보, 입법/행정예고, 부처 게시판, 보도자료/뉴스를 매일 수집해 보여주는 Next.js + TypeScript MVP입니다. 공식 출처 링크가 없는 결과는 `검증 필요`로 표시하고, 뉴스는 공식 변경으로 분류하지 않습니다.

## 주요 기능

- `scripts/fetch.ts`: 법제처/국가법령정보센터 API를 우선 호출하고, 설정된 RSS/게시판/뉴스 보조 소스를 수집합니다.
- `scripts/diff.ts`: 최신 스냅샷과 직전 스냅샷의 신규/변경/삭제 항목을 비교합니다.
- `scripts/summarize.ts`: `OPENAI_API_KEY`가 있으면 OpenAI Responses API로, 없으면 근거 추출 방식으로 `자동요약`을 생성합니다. 자동요약은 원문을 대체하지 않습니다.
- `app/page.tsx`: 오늘의 변경 목록, 기관/유형/변경상태/날짜 필터, 제목/본문/기관/문서번호 검색을 제공합니다.
- `app/items/[id]/page.tsx`: 상세, 원문 URL, 첨부 URL, 원문 추출 텍스트를 보여줍니다.

## 공식 출처와 구현 상태

- 국가법령정보센터 Open API: [공동활용 Open API 가이드](https://open.law.go.kr/LSO/openApi/guideList.do)
  - 법령 변경이력: `target=lsHstInf`
  - 일자별 조문 개정 이력: `target=lsJoHstInf`
  - 행정규칙 목록/본문: `target=admrul`
  - 행정규칙 신구법 비교: `target=admrulOldAndNew`
- 국민참여입법센터 API: [OPEN API 활용가이드](https://opinion.lawmaking.go.kr/api/operationGuide)
  - 입법예고: `http://www.lawmaking.go.kr/rest/ogLmPp`
  - 행정예고: `http://www.lawmaking.go.kr/rest/ptcpAdmPp`
- 관보 Open API: [공공데이터포털 관보 데이터셋](https://www.data.go.kr/data/15109157/openapi.do)
  - Swagger에서 확인한 실제 목록 API URL을 `GWANBO_LIST_URL`에 넣은 경우에만 활성화합니다. 확인 전 임의 endpoint를 호출하지 않습니다.
- 부처 게시판/RSS
  - 행정안전부 게시판은 `MOIS_BOARD_URL` 기본값으로 HTML 목록을 시도합니다.
  - 재정경제부/기획재정부 게시판은 정부 조직/사이트 개편 가능성이 있어 `MOEF_BOARD_URL`을 설정한 경우에만 수집합니다.
  - 대한민국 정책브리핑 RSS는 보조 `press` 소스로 수집합니다.
- 네이버 뉴스 검색 API: [공식 문서](https://developers.naver.com/docs/serviceapi/search/news/news.md)
  - `news`로만 저장하며 공식 변경으로 표시하지 않습니다.
- OpenAI 요약: [Responses API 문서](https://platform.openai.com/docs/api-reference/responses)
  - 선택 기능입니다. 키가 없으면 근거 추출형 자동요약으로 동작합니다.

## 환경변수

`.env.example`을 참고해 `.env.local`을 만듭니다.

```bash
LAW_OPEN_API_OC=your-open-law-oc
LAWMAKING_BASE=http://www.lawmaking.go.kr/rest
GWANBO_LIST_URL=
DATA_GO_KR_SERVICE_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
```

법제처 API 키는 국가법령정보센터 공동활용 신청 후 발급받습니다. 공공데이터포털 관보 API는 활용신청 후 Swagger에서 실제 호출 URL을 확인해 `GWANBO_LIST_URL`에 넣습니다.

## 로컬 실행

```bash
npm install
npm run collect
npm run dev
```

정적 배포 파일은 다음 명령으로 생성됩니다.

```bash
npm run build
```

생성 결과는 `out/`에 저장되어 GitHub Pages에 올릴 수 있습니다. Vercel에서도 같은 Next.js 구조로 배포할 수 있습니다.

## GitHub Actions

`.github/workflows/daily-collect.yml`은 매일 06:10 Asia/Seoul 기준으로 실행됩니다. GitHub cron은 UTC라서 `10 21 * * *`로 설정되어 있습니다.

필수 secrets:

- `LAW_OPEN_API_OC`
- `DATA_GO_KR_SERVICE_KEY`와 `GWANBO_LIST_URL`은 관보 API를 사용할 때 설정
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`은 뉴스 보조 수집을 사용할 때 설정
- `OPENAI_API_KEY`는 실제 AI 자동요약을 사용할 때 설정

선택 repository variables:

- `MOIS_BOARD_URL`
- `MOEF_BOARD_URL`
- `KOREA_POLICY_RSS`
- `NEXT_PUBLIC_BASE_PATH` GitHub Pages가 `/repo-name` 하위 경로일 때 설정

## 데이터 저장

현재 저장소는 로컬 JSON입니다.

- 누적 데이터: `data/items.json`
- 일별 스냅샷: `data/snapshots/YYYY-MM-DD.json`
- diff 결과: `data/diff.json`
- 수집 로그: `data/logs/last-fetch.json`

Supabase로 확장할 때는 `lib/store.ts`의 `DataStore` 인터페이스와 `itemTableColumns`를 기준으로 JSON store를 DB store로 바꾸면 됩니다.

## 운영 주의사항

- 원문 상세 URL이 없으면 공식 API/목록 URL을 남기고 `검증 필요`로 표시합니다.
- 첨부파일 파싱 실패는 수집 로그에 남기고 원문 URL을 유지합니다.
- 뉴스와 정책 RSS는 참고 신호입니다. `confidence=news` 또는 `press`로 저장되며 공식 변경으로 집계하지 않습니다.
- 자동요약은 `자동요약:` 접두사를 붙이고, 원문 근거가 부족하면 단정하지 않는 문구를 넣습니다.
