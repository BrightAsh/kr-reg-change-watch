import ItemExplorer from "@/components/ItemExplorer";
import { getStats, sortItems, uniqueSorted } from "@/lib/data";
import { previewItems, previewRun } from "@/lib/previewData";

export default function PreviewPage() {
  const items = sortItems(previewItems);
  const stats = getStats(items);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted(items.map((item) => item.collection_date || item.publish_date)).reverse();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local preview</p>
          <h1>샘플 데이터 미리보기</h1>
        </div>
        <div className="run-info">
          <span>기준일 {previewRun.last_target_date}</span>
          <span>최근 실행 {new Date(previewRun.last_run_at || "").toLocaleString("ko-KR")}</span>
        </div>
      </header>

      <section className="stats-strip" aria-label="샘플 통계">
        <div>
          <strong>{stats.total.toLocaleString("ko-KR")}</strong>
          <span>전체 항목</span>
        </div>
        <div>
          <strong>{stats.official.toLocaleString("ko-KR")}</strong>
          <span>공식 법령/관보</span>
        </div>
        <div>
          <strong>{stats.notices.toLocaleString("ko-KR")}</strong>
          <span>예고/공고</span>
        </div>
        <div>
          <strong>{stats.verify.toLocaleString("ko-KR")}</strong>
          <span>검증 필요</span>
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
