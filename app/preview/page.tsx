import ItemExplorer from "@/components/ItemExplorer";
import { getStats, sortItems, uniqueSorted } from "@/lib/data";
import { previewItems, previewRun } from "@/lib/previewData";

export default function PreviewPage() {
  const items = sortItems(previewItems);
  const stats = getStats(items);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted(items.map((item) => item.collection_date || item.publish_date)).reverse();
  const lastRun = previewRun.last_run_at ? new Date(previewRun.last_run_at).toLocaleString("ko-KR") : "샘플 실행";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="app-mark" aria-hidden="true">
            R
          </span>
          <div>
            <p>Preview</p>
            <strong>샘플 데이터 미리보기</strong>
          </div>
        </div>
        <div className="sync-status" aria-label="미리보기 상태">
          <span>로컬 미리보기</span>
          <strong>{previewRun.last_target_date}</strong>
          <small>{lastRun}</small>
        </div>
      </header>

      <section className="overview-band" aria-label="샘플 화면 개요">
        <div className="overview-copy">
          <p className="eyebrow">Local app preview</p>
          <h1>샘플 규제 변경</h1>
          <p>설치 없이 샘플 데이터로 날짜, 필터, 상세 화면을 확인합니다.</p>
        </div>
        <div className="overview-metrics" aria-label="샘플 통계">
          <div>
            <span>전체</span>
            <strong>{stats.total.toLocaleString("ko-KR")}</strong>
          </div>
          <div>
            <span>공식 자료</span>
            <strong>{stats.official.toLocaleString("ko-KR")}</strong>
          </div>
          <div>
            <span>예고/공고</span>
            <strong>{stats.notices.toLocaleString("ko-KR")}</strong>
          </div>
          <div>
            <span>확인 필요</span>
            <strong>{stats.verify.toLocaleString("ko-KR")}</strong>
          </div>
        </div>
      </section>

      <ItemExplorer
        items={items}
        ministries={ministries}
        dates={dates}
        logs={previewRun.logs}
        run={previewRun}
        detailHrefPrefix="/preview/items"
      />
    </main>
  );
}
