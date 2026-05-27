# 한국 규제 변경 모니터

법령, 고시·공고, 지침·행정규칙, 정책자료, 뉴스 보조 자료를 날짜별로 수집해 보여주는 정적 웹 앱입니다. 화면은 GitHub Pages에 배포되며, 사용자는 저장된 일자별 자료를 캘린더와 필터로 탐색합니다.

서비스 페이지: https://brightash.github.io/kr-reg-change-watch/

## 현재 동작 요약

- GitHub Actions가 매일 한국시간 00:00에 자동 실행됩니다.
- 자동 실행의 기본 수집일은 한국시간 기준 전일입니다.
- 웹페이지에서 날짜를 클릭하면 이미 저장된 해당 날짜 자료를 보여줍니다.
- 현재 GitHub Pages 정적 배포라서, 웹페이지 클릭만으로 새 수집을 즉시 실행하지는 않습니다.
- 같은 날짜의 `data/daily/YYYY-MM-DD.json`이 있으면 기본적으로 외부 수집을 다시 하지 않고 캐시를 사용합니다.
- 강제 재수집은 GitHub Actions 수동 실행에서 `force`를 켜거나 로컬에서 `--force`를 붙여 실행합니다.
- 아래의 “현재 상태” 설명은 README 작성 시점의 최근 수집 로그(`data/run.json`, 마지막 대상일 `2026-05-21`) 기준입니다. 이후 자동 수집이 돌면 상태와 건수는 바뀔 수 있습니다.

## 화면 구성

- 왼쪽 캘린더: 날짜별 저장 자료 개수를 표시합니다.
- 날짜별 분류 카운트: 선택한 날짜의 `전체`, `법령`, `고시/공고`, `지침/규칙`, `뉴스/발언` 개수를 보여줍니다.
- 상단 필터: 기관, 출처, 문서, 변경 유형을 다중 선택할 수 있습니다.
- 검색: 제목, 본문, 기관, 문서번호를 검색합니다.
- AI 브리핑: 사용자가 브라우저에서 OpenAI API 키를 입력하면 현재 화면에 표시된 항목을 요약합니다. 이 키는 브라우저 세션 저장소에만 저장됩니다.

## 자동 수집 흐름

`.github/workflows/daily-collect.yml`이 자동 수집과 배포를 담당합니다.

- 예약 실행: `0 15 * * *`, 즉 한국시간 00:00
- 기본 대상일: `FETCH_LOOKBACK_DAYS=1`이므로 한국시간 기준 전일
- 수동 실행: `workflow_dispatch`에서 `target_date`와 `force`를 입력
- Push 실행: 코드나 문서가 `main`에 push되면 수집은 건너뛰고 빌드/배포만 수행
- 수집 실행 조건: 예약 실행 또는 수동 실행
- 수집 후 처리: `data/**` 변경 사항을 커밋하고 다시 push
- 배포: `npm run build`로 정적 export를 만든 뒤 GitHub Pages에 배포

`npm run collect`는 아래 순서로 실행됩니다.

1. `scripts/fetch.ts`: 외부 출처에서 대상일 자료 수집
2. `scripts/diff.ts`: 대상일 스냅샷과 직전 스냅샷 비교
3. `scripts/summarize.ts`: OpenAI 키가 있으면 AI 요약, 없으면 원문 기반 기계적 요약

## 수집 결과 저장 위치

- 누적 목록: `data/items.json`
- 일자별 캐시: `data/daily/YYYY-MM-DD.json`
- 비교용 스냅샷: `data/snapshots/YYYY-MM-DD.json`
- 최근 실행 상태: `data/run.json`
- 최근 수집 로그: `data/logs/last-fetch.json`
- 최근 변경 비교: `data/diff.json`

## 수집 출처와 방식

| 구분 | 수집 항목 | 수집 방법 | 필요한 키/설정 | 현재 상태 |
| --- | --- | --- | --- | --- |
| 국가법령정보센터 | 법령 변경이력, 조문 개정 이력, 행정규칙, 행정규칙 신구법 비교 | 대상 날짜로 Open API를 조회하고, 여러 행으로 내려오는 자료는 법령ID/행정규칙ID 단위로 묶어 저장 | `LAW_OPEN_API_OC` | 정상 수집 중 |
| 국민참여입법센터 | 법제처·행안부·기재부 입법예고, 행정예고 | 기관코드 또는 기관명과 대상 날짜로 공개 XML API 조회 | `LAWMAKING_OC` 권장, 없으면 `LAW_OPEN_API_OC` 사용 | 최근 실행 기준 `retMsg 401`로 미수집 |
| 대한민국 전자관보 | 관보 고시, 공고, 법령 공포성 자료 | 관보 목록 API URL에 대상 날짜와 서비스키를 붙여 조회 | `GWANBO_LIST_URL`, `DATA_GO_KR_SERVICE_KEY` | URL 미설정으로 건너뜀 |
| 행정안전부 게시판 | 훈령·예규·고시, 입법·행정예고 | 공식 게시판 HTML 목록과 상세 페이지를 읽고 대상 날짜 글만 저장 | 별도 키 없음 | 접근 정상, 최근 대상일 저장 0건 |
| 기획재정부 게시판 | 훈령, 예규, 고시, 공고, 지침, 입법예고, 행정예고 | 공식 게시판 HTML 목록과 상세 페이지를 읽고 대상 날짜 글만 저장 | 별도 키 없음 | 접근 정상, 최근 대상일 저장 0건 |
| 정책브리핑 RSS | 보도자료, 정책뉴스, 부처 RSS, 대통령·연설·국무회의·브리핑 RSS | RSS 발행일이 대상 날짜이고 규제 관련 키워드가 있는 항목만 저장 | 별도 키 없음 | 접근 정상, 최근 대상일 저장 0건 |
| 네이버 뉴스 검색 | 규제·법령·고시·지침 관련 뉴스 | 기본 검색어를 뉴스 API로 조회하고 대상 날짜 기사만 저장 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | API 호출 정상, 최근 대상일 저장 0건 |

뉴스, 정책브리핑, 대통령·장관 발언성 자료는 공식 변경 확정 자료가 아니라 참고 자료입니다. 화면에서는 `확인 필요` 성격으로 취급합니다.

수집기는 외부 출처에서 가져온 항목을 그대로 누적하지 않고, 아래 방식으로 정리합니다.

| 처리 단계 | 내용 |
| --- | --- |
| 날짜 필터링 | 대상 날짜에 수집되었거나 대상 날짜에 공표된 자료만 해당 일자 자료로 저장 |
| 중복 정리 | 법령ID, 행정규칙ID, 원문 URL, 안정 ID를 기준으로 중복 항목 병합 |
| 본문 확보 | 가능한 경우 상세 페이지, 원문 링크, 첨부 링크, API 원문 데이터를 함께 저장 |
| 분류 | 법령, 고시/공고, 지침/규칙, 뉴스/발언으로 자동 분류 |
| 신뢰도 표시 | 공식 API/게시판은 공식 자료로, 뉴스·정책자료는 확인 필요 자료로 표시 |
| 요약 | `OPENAI_API_KEY`가 있으면 AI 요약, 없으면 원문과 메타데이터 기반 기계적 요약 |

## 필요한 키와 설정

### 반드시 필요한 키

- `LAW_OPEN_API_OC`: 국가법령정보센터 Open API 수집에 필요합니다. 현재 가장 중요한 공식 수집 키입니다.

### 있으면 활성화되는 키/설정

- `LAWMAKING_OC`: 국민참여입법센터 입법예고/행정예고 수집용입니다. `LAW_OPEN_API_OC`와 별도로 승인된 값이 필요할 수 있습니다.
- `GWANBO_LIST_URL`: 전자관보 목록 API 실제 호출 URL입니다. 없으면 관보 수집은 건너뜁니다.
- `DATA_GO_KR_SERVICE_KEY`: 전자관보 공공데이터 호출에 붙이는 서비스키입니다.
- `NAVER_CLIENT_ID`: 네이버 뉴스 검색 API 클라이언트 ID입니다.
- `NAVER_CLIENT_SECRET`: 네이버 뉴스 검색 API 클라이언트 secret입니다.
- `OPENAI_API_KEY`: 자동 수집 후 요약 품질을 높이는 데 사용합니다. 없어도 수집은 됩니다.

### 선택 환경변수

- `LAW_OPEN_API_BASE`: 국가법령정보센터 API base URL. 기본값은 `https://www.law.go.kr/DRF`
- `LAWMAKING_BASE`: 국민참여입법센터 API base URL. 기본값은 `https://www.lawmaking.go.kr/rest`
- `FETCH_LOOKBACK_DAYS`: 자동 수집 기준일. 기본값은 `1`
- `FORCE_COLLECT`: `1`이면 캐시가 있어도 재수집
- `FETCH_MAX_PAGES`: 목록/API 페이지 탐색 수. 기본값은 `5`
- `FETCH_DETAIL_LIMIT`: 상세 본문 조회 제한. 기본값은 `30`
- `FETCH_RETRIES`: HTTP 재시도 횟수. 기본값은 `3`
- `FETCH_TIMEOUT_MS`: HTTP 요청 제한 시간. 기본값은 `45000`
- `KOREA_POLICY_RSS`: 정책브리핑 RSS 목록을 쉼표 구분 URL로 대체
- `NAVER_NEWS_QUERIES`: 네이버 뉴스 검색어를 쉼표 구분 키워드로 대체
- `SUMMARY_MAX_CHARS`: 요약 입력 원문 길이. 기본값은 `800`
- `OPENAI_MODEL`: 자동 요약 모델. 기본값은 `gpt-5`
- `MOIS_BOARD_URL`, `MOIS_NOTICE_BOARD_URL`: 행정안전부 게시판 URL 대체
- `MOEF_DIRECTIVE_URL`, `MOEF_ESTABLISHED_RULE_URL`, `MOEF_NOTICE_URL`, `MOEF_ANNOUNCEMENT_URL`, `MOEF_GUIDELINE_URL`, `MOEF_LEGISLATION_NOTICE_URL`, `MOEF_ADMIN_NOTICE_URL`: 기획재정부 게시판 URL 대체

## 로컬 실행

```bash
npm install
npm run collect
npm run dev
```

특정 날짜 수집:

```bash
npm run collect -- --date 2026-05-25
```

캐시가 있어도 강제 재수집:

```bash
npm run collect -- --date 2026-05-25 --force
```

Node.js/npm 없이 화면 형태만 확인해야 하는 환경에서는 저장소 루트의 `preview.html`을 브라우저로 엽니다. 이 파일은 샘플 데이터 기반 단일 HTML 미리보기입니다.

## 수동 수집 방법

GitHub 저장소의 Actions에서 `Daily collect and deploy` 워크플로를 수동 실행합니다.

- `target_date`: 수집할 날짜. 예: `2026-05-25`
- `force`: 기존 일자별 캐시가 있어도 재수집할지 여부

수동 실행도 자동 실행과 같은 `npm run collect` 흐름을 사용합니다.
