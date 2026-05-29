# 한국 규제 변경 모니터

법령, 고시·공고, 지침·행정규칙, 정책자료, 뉴스 보조 자료를 자동으로 수집해 날짜별로 보여주는 규제 변경 모니터링 앱입니다. 사용자는 자동으로 정리된 자료를 캘린더와 필터로 탐색합니다.

서비스 페이지: https://brightash.github.io/kr-reg-change-watch/

## 수집 출처와 방식

| 구분 | 수집 항목 | 수집 방법 | 필요한 키/설정 | 현재 상태 |
| --- | --- | --- | --- | --- |
| 국가법령정보센터 | 법령 변경이력, 조문 개정 이력, 개정문/제개정이유, 행정규칙, 행정규칙 신구법 비교 | 대상 날짜로 Open API를 조회하고, 여러 행으로 내려오는 자료는 법령ID/행정규칙ID 단위로 묶어 저장 | `LAW_OPEN_API_OC` | 정상 |
| 국민참여입법센터 | 법제처·행안부·기재부 입법예고, 입법예고 수정분, 행정예고 | 입법예고 목록, 입법예고 목록(수정일 기준), 행정예고 목록 API를 대상 날짜로 조회하고 상세 API로 본문과 첨부를 보강 | `LAWMAKING_OC` | 키 설정 필요 |
| 대한민국 전자관보 | 관보 고시, 공고, 법령 공포성 자료 | 관보 목록 API URL에 대상 날짜와 서비스키를 붙여 조회 | `GWANBO_LIST_URL`, `DATA_GO_KR_SERVICE_KEY` | 정상 |
| 행정안전부 게시판 | 훈령·예규·고시, 입법·행정예고 | 공식 게시판 HTML 목록과 상세 페이지를 읽고 대상 날짜 글만 저장 | 별도 키 없음 | 정상 |
| 기획재정부 게시판 | 훈령, 예규, 고시, 공고, 지침, 입법예고, 행정예고 | 공식 게시판 HTML 목록과 상세 페이지를 읽고 대상 날짜 글만 저장 | 별도 키 없음 | 정상 |
| 정책브리핑 RSS | 보도자료, 정책뉴스, 부처 RSS, 대통령·연설·국무회의·브리핑 RSS | RSS 발행일이 대상 날짜이고 규제 관련 키워드가 있는 항목만 저장 | 별도 키 없음 | 정상 |
| 네이버 뉴스 검색 | 규제·법령·고시·지침 관련 뉴스 | 기본 검색어를 뉴스 API로 조회하고 대상 날짜 기사만 저장 | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 정상 |

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

- `LAW_OPEN_API_OC`: 국가법령정보센터 Open API 수집에 필요합니다. 현재 가장 중요한 공식 수집 키입니다. `LAW_OC` 또는 `KOREAN_LAW_API_KEY` 이름으로도 인식합니다.

### 있으면 활성화되는 키/설정

- `LAWMAKING_OC`: 국민참여입법센터 입법예고, 입법예고 수정일 기준, 행정예고 수집용입니다. `LAW_OPEN_API_OC`와 별도 값이며, 정보공개 서비스 신청 계정 ID에서 `@` 앞부분을 사용합니다.
- `GWANBO_LIST_URL`: 전자관보 목록 API 실제 호출 URL입니다. 현재 관보 목록 API는 `https://open.gwanbo.go.kr/OpenApi/ApiTotalService/getApiTotalList`를 사용합니다.
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
- `FETCH_LAW_TEXT_DETAIL_LIMIT`: 법제처 변경이력 항목의 개정문/제개정이유 보강 조회 제한. 기본값은 `25`
- `FETCH_LAW_TEXT_MAX_CHARS`: 법제처 개정문/제개정이유를 항목별로 저장할 최대 글자 수. 기본값은 `12000`
- `FETCH_RETRIES`: HTTP 재시도 횟수. 기본값은 `3`
- `FETCH_TIMEOUT_MS`: HTTP 요청 제한 시간. 기본값은 `45000`
- `LAW_USER_AGENT`: 법제처 API 호출에 사용할 User-Agent. 기본값이 있으므로 보통 설정하지 않아도 됩니다.
- `KOREA_POLICY_RSS`: 정책브리핑 RSS 목록을 쉼표 구분 URL로 대체
- `NAVER_NEWS_QUERIES`: 네이버 뉴스 검색어를 쉼표 구분 키워드로 대체
- `SUMMARY_MAX_CHARS`: 요약 입력 원문 길이. 기본값은 `800`
- `OPENAI_MODEL`: 자동 요약 모델. 기본값은 `gpt-5`
- `MOIS_BOARD_URL`, `MOIS_NOTICE_BOARD_URL`: 행정안전부 게시판 URL 대체
- `MOEF_DIRECTIVE_URL`, `MOEF_ESTABLISHED_RULE_URL`, `MOEF_NOTICE_URL`, `MOEF_ANNOUNCEMENT_URL`, `MOEF_GUIDELINE_URL`, `MOEF_LEGISLATION_NOTICE_URL`, `MOEF_ADMIN_NOTICE_URL`: 기획재정부 게시판 URL 대체
