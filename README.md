# 한국 규제·법령 변경 모니터

한국의 법령, 고시·공고, 지침·행정규칙, 정책 발언·뉴스를 날짜별로 수집하고 정리하는 Next.js 기반 모니터링 앱입니다. GitHub Actions가 매일 한국시간 00:00에 전일 24시간 자료를 수집하고, GitHub Pages는 이미 수집된 일자별 캐시를 정적 화면으로 보여줍니다.

## 링크

- 서비스 페이지: https://brightash.github.io/kr-reg-change-watch/
- 수동 수집 실행: https://github.com/BrightAsh/kr-reg-change-watch/actions/workflows/daily-collect.yml
- 저장소: https://github.com/BrightAsh/kr-reg-change-watch

## 화면 구성

- `법령`: 법률, 시행령, 시행규칙 등 법령 단위 변경
- `고시/공고`: 고시, 공고, 입법예고, 행정예고, 관보성 자료
- `지침/규칙`: 훈령, 예규, 지침 등 행정규칙성 자료
- `뉴스/발언`: 정책브리핑, 대통령·국무회의·연설 RSS, 뉴스 검색 보조 자료

홈 화면에서 수집 기준일, 분류 탭, 기관, 출처, 문서 유형, 변경상태, 검색어로 필터링합니다. 법령의 공포일이 과거여도 해당 날짜 수집 API가 반환한 변경 건이면 그 날짜의 자료로 표시합니다. 수집 데이터만으로 만들 수 있는 연혁표와 기계적 요약은 OpenAI 없이 표시하고, OpenAI API 키를 브라우저에 입력하면 현재 표시 중인 항목을 세션 안에서 추가 요약할 수 있습니다. 배포 자동 수집 요약은 GitHub Actions의 `OPENAI_API_KEY` secret이 있을 때 수행됩니다.

## 수집 출처

- 국가법령정보센터 Open API
  - 법령 변경이력: `lsHstInf`
  - 일자별 조문 개정 이력: `lsJoHstInf`
  - 행정규칙 목록/본문: `admrul`
  - 행정규칙 신구법 비교: `admrulOldAndNew`
  - 법령 변경이력이 한 법령의 전체 과거 연혁을 반환하면 법령ID 단위 대표 항목으로 묶어 표시
- 국민참여입법센터 공개 API
  - 입법예고: `ogLmPp`
  - 행정예고: `ptcpAdmPp`
- 대한민국 전자관보 API
  - `GWANBO_LIST_URL`과 `DATA_GO_KR_SERVICE_KEY`가 있을 때 활성화
- 행정안전부 공식 게시판
  - 훈령·예규·고시
  - 입법·행정예고
- 기획재정부 공식 게시판
  - 훈령, 예규, 고시, 공고, 지침
  - 입법·행정예고
- 대한민국 정책브리핑 RSS
  - 보도자료, 정책뉴스, 법제처, 행정안전부, 재정경제부, 대통령 브리핑, 연설문, 국무회의 브리핑, 부처 브리핑
- 네이버 뉴스 검색 API
  - 지정 키워드별 검색 후 해당 날짜 기사만 저장

뉴스와 발언은 참고 자료이며 공식 법령 변경으로 확정하지 않습니다. 화면에는 `검증 필요` 상태로 표시됩니다.

## 일자별 캐시

수집 결과는 다음 파일에 저장됩니다.

- 누적 목록: `data/items.json`
- 일자별 캐시: `data/daily/YYYY-MM-DD.json`
- 비교용 스냅샷: `data/snapshots/YYYY-MM-DD.json`
- 최근 실행 상태: `data/run.json`
- 최근 수집 로그: `data/logs/last-fetch.json`

같은 날짜의 `data/daily/YYYY-MM-DD.json`이 이미 있으면 기본적으로 외부 수집을 다시 하지 않고 캐시를 사용합니다. 강제 재수집은 GitHub Actions 수동 실행에서 `force`를 켜거나, 로컬에서 `--force`를 붙입니다.

## 실행 방식

```bash
npm install
npm run collect
npm run dev
```

특정 날짜를 수집하려면:

```bash
npm run collect -- --date 2026-05-25
```

이미 캐시가 있어도 다시 수집하려면:

```bash
npm run collect -- --date 2026-05-25 --force
```

Node.js/npm 없이 화면 형태만 확인해야 하는 환경에서는 저장소 루트의 `preview.html`을 브라우저로 엽니다. 이 파일은 샘플 데이터 기반 단일 HTML 미리보기입니다.

## GitHub Actions

`.github/workflows/daily-collect.yml`은 매일 `15:00 UTC`, 즉 한국시간 `00:00`에 실행됩니다. 기본값은 한국시간 기준 전일 24시간 자료입니다.

수동 실행(`workflow_dispatch`) 입력:

- `target_date`: `YYYY-MM-DD` 형식 날짜
- `force`: 기존 일자별 캐시가 있어도 재수집

필수 또는 권장 secrets:

- `LAW_OPEN_API_OC`: 국가법령정보센터 Open API 키
- `DATA_GO_KR_SERVICE_KEY`: 관보 API 사용 시
- `GWANBO_LIST_URL`: 관보 목록 API 실제 호출 URL
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`: 뉴스 검색 보조 수집
- `OPENAI_API_KEY`: Actions 수집 후 자동요약

네이버 뉴스 검색을 사용하려면 네이버 개발자 센터에서 검색 API 애플리케이션을 만들고, GitHub 저장소 `Settings > Secrets and variables > Actions > Repository secrets`에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 이름으로 저장합니다. 두 값이 없으면 공식 출처 수집은 계속 실행되지만 네이버 뉴스 보조 수집은 건너뜁니다.

선택 variables:

- `KOREA_POLICY_RSS`: 기본 정책브리핑 RSS 목록을 대체할 쉼표 구분 URL
- `NAVER_NEWS_QUERIES`: 기본 뉴스 검색 키워드를 대체할 쉼표 구분 키워드
- `FETCH_MAX_PAGES`: 공식 게시판/API 페이지 탐색 수
- `FETCH_DETAIL_LIMIT`: 상세 본문 조회 수 제한
- `SUMMARY_MAX_CHARS`: 요약 입력 원문 길이

## 정적 배포 제약

현재 배포 방식은 GitHub Pages 정적 export입니다. 따라서 사용자가 웹페이지에서 날짜를 클릭하는 순간 서버가 즉시 새 수집을 실행할 수는 없습니다. 페이지는 이미 생성된 일자별 캐시와 누적 데이터를 보여줍니다.

특정 날짜를 새로 수집하려면 위의 수동 수집 실행 링크에서 `Run workflow`를 누르고 `target_date`를 입력합니다. 웹페이지 클릭으로 즉시 수집하려면 Vercel, Cloudflare Workers, Supabase Edge Functions 같은 서버 실행 환경과 사용자 인증이 필요합니다. 이 경우 `scripts/collect.ts`를 서버 작업으로 호출하고, 수집 결과를 DB 또는 저장소에 기록하는 구조로 확장합니다.
