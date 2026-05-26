import type { CollectedItem, CollectionLog, RunMetadata } from "./types";

export const previewItems: CollectedItem[] = [
  {
    id: "preview-official-law-2026-05-26",
    source: "국가법령정보센터",
    source_type: "official_law",
    ministry: "행정안전부",
    document_type: "law",
    title: "전자정부법 일부개정법률 시행",
    issue_number: "법률 제00001호",
    publish_date: "2026-05-26",
    effective_date: "2026-08-01",
    change_type: "partial_revision",
    original_url: "https://www.law.go.kr",
    attachment_urls: ["https://www.law.go.kr/sample/egov-amendment.pdf"],
    raw_text:
      "전자정부서비스 제공 절차와 민원 처리 통지 방식에 관한 조항을 정비한다. 온라인 고지, 전자문서 송달, 행정정보 공동이용 절차의 적용 범위를 명확히 한다.",
    raw_hash: "preview-001",
    summary: "전자정부서비스 고지와 송달 절차를 정비하고 공동이용 범위를 명확히 하는 일부개정 예시입니다.",
    diff_summary: "제12조의 전자문서 송달 문구가 보완되고 부칙 시행일이 추가되었습니다.",
    confidence: "official",
    verification_required: false,
    auto_summary: true,
    collected_at: "2026-05-26T06:10:00+09:00",
    source_record_id: "preview-001"
  },
  {
    id: "preview-notice-2026-05-26",
    source: "국민참여입법센터",
    source_type: "legislation_notice",
    ministry: "고용노동부",
    document_type: "notice",
    title: "근로시간 기록 관리지침 일부개정안 행정예고",
    issue_number: "고용노동부공고 제2026-101호",
    publish_date: "2026-05-26",
    effective_date: null,
    change_type: "notice",
    original_url: "https://opinion.lawmaking.go.kr",
    attachment_urls: [],
    raw_text:
      "근로시간 기록 보관 기간, 전자기록 인정 요건, 사업장 점검 시 제출자료 범위를 정비하는 행정예고 예시 데이터입니다. 의견 제출 기한은 공고일로부터 20일입니다.",
    raw_hash: "preview-002",
    summary: "근로시간 전자기록의 인정 요건과 제출자료 범위를 손보는 행정예고 예시입니다.",
    diff_summary: null,
    confidence: "official_notice",
    verification_required: false,
    auto_summary: true,
    collected_at: "2026-05-26T06:10:00+09:00",
    source_record_id: "preview-002"
  },
  {
    id: "preview-gazette-2026-05-25",
    source: "관보",
    source_type: "gazette",
    ministry: "환경부",
    document_type: "announcement",
    title: "대기환경 측정망 운영계획 변경 고시",
    issue_number: "환경부고시 제2026-55호",
    publish_date: "2026-05-25",
    effective_date: "2026-06-15",
    change_type: "new",
    original_url: "https://www.gwanbo.go.kr",
    attachment_urls: ["https://www.gwanbo.go.kr/sample/air-monitoring.hwp"],
    raw_text:
      "대기환경 측정망 운영 지점, 측정 항목, 자료 공개 주기를 정하는 고시 예시입니다. 일부 신규 측정소의 운영 개시일과 관할 기관을 포함합니다.",
    raw_hash: "preview-003",
    summary: "대기환경 측정망 운영 지점과 공개 주기를 정하는 관보 고시 예시입니다.",
    diff_summary: "신규 측정소 3곳과 자료 공개 주기 항목이 추가되었습니다.",
    confidence: "official",
    verification_required: false,
    auto_summary: true,
    collected_at: "2026-05-25T06:10:00+09:00",
    source_record_id: "preview-003"
  },
  {
    id: "preview-press-2026-05-24",
    source: "정책브리핑",
    source_type: "press",
    ministry: "기획재정부",
    document_type: "news",
    title: "디지털 행정서비스 개선방안 발표",
    issue_number: null,
    publish_date: "2026-05-24",
    effective_date: null,
    change_type: "unknown",
    original_url: "https://www.korea.kr",
    attachment_urls: [],
    raw_text:
      "정부가 디지털 행정서비스 개선방안을 발표했다는 보도자료 예시입니다. 이 항목은 참고자료이며 공식 법령 변경으로 집계하지 않습니다.",
    raw_hash: "preview-004",
    summary: "정책 방향을 보여주는 보도자료 예시이며 공식 변경 건수에는 포함하지 않습니다.",
    diff_summary: null,
    confidence: "press",
    verification_required: true,
    auto_summary: true,
    collected_at: "2026-05-24T06:10:00+09:00",
    source_record_id: "preview-004"
  },
  {
    id: "preview-news-2026-05-23",
    source: "뉴스 검색",
    source_type: "news",
    ministry: "국토교통부",
    document_type: "news",
    title: "건축 인허가 절차 간소화 관련 기사",
    issue_number: null,
    publish_date: "2026-05-23",
    effective_date: null,
    change_type: "unknown",
    original_url: "https://news.example.com/regulation-preview",
    attachment_urls: [],
    raw_text:
      "건축 인허가 절차 간소화 논의에 관한 뉴스 예시입니다. 공식 출처를 확인하기 전까지 검증 필요 상태로 표시합니다.",
    raw_hash: "preview-005",
    summary: "공식 원문 확인 전 참고용으로만 보는 뉴스 예시입니다.",
    diff_summary: null,
    confidence: "news",
    verification_required: true,
    auto_summary: false,
    collected_at: "2026-05-23T06:10:00+09:00",
    source_record_id: "preview-005"
  }
];

export const previewRun: RunMetadata = {
  last_run_at: "2026-05-26T06:10:00+09:00",
  last_target_date: "2026-05-26",
  item_count: previewItems.length,
  changed_count: 3,
  logs: [
    {
      source: "국가법령정보센터",
      status: "ok",
      message: "샘플 법령 변경 데이터를 불러왔습니다.",
      count: 1,
      at: "2026-05-26T06:10:00+09:00"
    },
    {
      source: "국민참여입법센터",
      status: "ok",
      message: "샘플 예고 데이터를 불러왔습니다.",
      count: 1,
      at: "2026-05-26T06:10:00+09:00"
    },
    {
      source: "관보",
      status: "ok",
      message: "샘플 관보 데이터를 불러왔습니다.",
      count: 1,
      at: "2026-05-25T06:10:00+09:00"
    },
    {
      source: "뉴스 검색",
      status: "skipped",
      message: "뉴스는 공식 변경으로 집계하지 않습니다.",
      count: 1,
      at: "2026-05-23T06:10:00+09:00"
    }
  ]
};
