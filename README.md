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

### 1. 국가법령정보센터 Open API

필수 키: `LAW_OPEN_API_OC`

사용 중인 API:

- `lawSearch.do?target=lsHstInf`: 법령 변경이력
- `lawSearch.do?target=lsJoHstInf`: 일자별 조문 개정 이력
- `lawSearch.do?target=admrul`: 행정규칙 목록
- `lawService.do?target=admrul`: 행정규칙 본문
- `lawSearch.do?target=admrulOldAndNew`: 행정규칙 신구법 비교 목록
- `lawService.do?target=admrulOldAndNew`: 행정규칙 신구법 비교 본문

수집 방식:

- 대상일을 `regDt` 또는 `date` 파라미터로 넣어 조회합니다.
- 여러 행으로 쪼개져 내려오는 법령 변경이력과 조문 변경은 법령ID 단위로 묶습니다.
- 행정규칙과 행정규칙 신구법 비교는 같은 행정규칙 ID를 기준으로 중복 병합합니다.
- 원문 링크는 법제처 원문 URL을 사용합니다.

현재 상태:

- 최근 실행 기준 정상 수집 중입니다.

### 2. 국민참여입법센터 공개 XML API

권장 키: `LAWMAKING_OC`

대체 키: `LAW_OPEN_API_OC`

사용 중인 API:

- `https://www.lawmaking.go.kr/rest/ogLmPp.xml`: 입법예고
- `https://www.lawmaking.go.kr/rest/ptcpAdmPp.xml`: 행정예고

수집 대상 기관:

- 법제처: `1170000`
- 행정안전부: `1741000`
- 기획재정부: `1051000`

수집 방식:

- 입법예고는 기관코드와 시작일/종료일로 조회합니다.
- 행정예고는 기관명과 시작일/종료일로 조회합니다.
- 대상 날짜에 공고된 자료만 저장합니다.

현재 상태:

- 최근 실행 기준 `retMsg 401`이 발생했습니다.
- 즉, 현재 저장된 키가 국민참여입법센터 해당 API 사용 승인을 받지 못했거나 `LAWMAKING_OC`가 별도로 필요합니다.
- 이 출처는 로직은 구현되어 있지만 현재 정상 수집되지 않는 상태로 봐야 합니다.

### 3. 대한민국 전자관보 공공데이터

필요 키/설정:

- `GWANBO_LIST_URL`
- `DATA_GO_KR_SERVICE_KEY`

수집 방식:

- `GWANBO_LIST_URL`에 실제 목록 API 호출 URL을 넣으면 `fromDate`, `toDate`, `pageNo`, `numOfRows`, `serviceKey`를 붙여 조회합니다.
- 응답에서 관보 제목, 발행일, PDF 또는 원문 URL을 찾아 저장합니다.

현재 상태:

- 최근 실행 기준 `GWANBO_LIST_URL`이 없어 수집을 건너뛰었습니다.
- `DATA_GO_KR_SERVICE_KEY`만 있어서는 동작하지 않고, 실제 호출 가능한 관보 목록 URL이 필요합니다.

### 4. 행정안전부 공식 게시판

추가 키: 없음

기본 수집 URL:

- 훈령·예규·고시: `MOIS_BOARD_URL`
- 입법·행정예고: `MOIS_NOTICE_BOARD_URL`

수집 방식:

- 기본 URL이 코드에 들어 있으며, 환경변수로 대체할 수 있습니다.
- 목록 HTML을 읽고 대상일 게시글만 추출합니다.
- 게시글 링크가 자바스크립트 함수 형태인 경우 게시글 ID를 파싱해 상세 URL을 재구성합니다.
- 상세 본문과 첨부파일 URL을 함께 수집합니다.

현재 상태:

- 최근 실행 기준 게시판 접근은 정상입니다.
- 다만 해당 대상일에 저장할 항목은 0건이었습니다.

### 5. 기획재정부 공식 게시판

추가 키: 없음

기본 수집 URL:

- `MOEF_DIRECTIVE_URL`: 훈령
- `MOEF_ESTABLISHED_RULE_URL`: 예규
- `MOEF_NOTICE_URL`: 고시
- `MOEF_ANNOUNCEMENT_URL`: 공고
- `MOEF_GUIDELINE_URL`: 지침
- `MOEF_LEGISLATION_NOTICE_URL`: 입법예고
- `MOEF_ADMIN_NOTICE_URL`: 행정예고

수집 방식:

- 기본 도메인은 현재 응답이 안정적인 `https://mofe.go.kr`를 사용합니다.
- 목록 HTML을 읽고 대상일 게시글만 추출합니다.
- 기획재정부 게시판의 상세 URL 패턴을 재구성해 본문과 첨부파일을 확인합니다.

현재 상태:

- 최근 실행 기준 게시판 접근은 정상입니다.
- 다만 해당 대상일에 저장할 항목은 0건이었습니다.

### 6. 대한민국 정책브리핑 RSS

추가 키: 없음

기본 RSS:

- 보도자료: `http://www.korea.kr/rss/pressrelease.xml`
- 정책뉴스: `http://www.korea.kr/rss/policy.xml`
- 법제처: `http://www.korea.kr/rss/dept_moleg.xml`
- 행정안전부: `http://www.korea.kr/rss/dept_mois.xml`
- 기획재정부: `http://www.korea.kr/rss/dept_moef.xml`
- 대통령 브리핑: `http://www.korea.kr/rss/president.xml`
- 연설문: `http://www.korea.kr/rss/speech.xml`
- 국무회의 브리핑: `http://www.korea.kr/rss/cabinet.xml`
- 부처 브리핑: `http://www.korea.kr/rss/ebriefing.xml`

수집 방식:

- RSS의 `pubDate`가 대상일과 같은 항목만 봅니다.
- 제목과 설명에 `법령`, `개정`, `제정`, `폐지`, `고시`, `공고`, `훈령`, `예규`, `지침`, `입법예고`, `행정예고`가 포함된 항목만 저장합니다.
- 이 자료는 공식 변경 확정 자료가 아니라 참고 자료로 저장하며 `확인 필요`로 표시합니다.

현재 상태:

- 최근 실행 기준 RSS 접근은 정상입니다.
- 다만 해당 대상일에 저장할 항목은 0건이었습니다.

### 7. 네이버 뉴스 검색 API

필요 키:

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

기본 검색어:

- 법제처 법령 개정
- 행정안전부 고시
- 행정안전부 지침
- 기획재정부 고시
- 기획재정부 지침
- 입법예고 행정예고
- 대통령 법령 개정
- 장관 고시 개정

수집 방식:

- 네이버 뉴스 검색 API를 `sort=date`, `display=100`으로 호출합니다.
- 기사 발행일이 대상일과 같은 것만 저장합니다.
- 뉴스는 공식 변경 확정 자료가 아니므로 `확인 필요`로 표시합니다.

현재 상태:

- 최근 실행 기준 API 호출은 정상입니다.
- 다만 해당 대상일에 저장할 항목은 0건이었습니다.
- 키가 없으면 이 출처는 오류가 아니라 `skipped`로 기록되고 건너뜁니다.

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

## 현재 구현하지 않은 것

- 웹페이지에서 날짜를 누르는 즉시 서버가 새 수집을 실행하는 기능은 없습니다.
- 전자관보는 실제 목록 API URL이 설정되어야 하며, 현재 기본값만으로는 수집하지 않습니다.
- 국민참여입법센터는 로직은 있으나 최근 실행 기준 인증 `401`로 정상 수집되지 않았습니다.
- 대통령 발언과 장관 발언은 정책브리핑 RSS와 네이버 뉴스 검색을 통해 보조적으로만 확인합니다. 대통령실·각 부처의 모든 발언 페이지를 별도 크롤링하는 전용 수집기는 아직 없습니다.
- 뉴스와 정책자료는 공식 법령 변경으로 확정하지 않습니다. 화면에서는 참고 자료이자 확인 필요 자료로 취급합니다.
- 유료 판매용 서버 앱처럼 사용자별 계정, DB, 즉시 수집 큐, 수집 중 로딩 상태를 제공하지 않습니다. 현재는 GitHub Pages 정적 앱입니다.

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
