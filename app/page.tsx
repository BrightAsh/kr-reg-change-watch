import ItemExplorer from "@/components/ItemExplorer";
import { getStats, readItems, readRunMetadata, sortItems, uniqueSorted } from "@/lib/data";

export default async function HomePage() {
  const items = sortItems(await readItems());
  const run = await readRunMetadata();
  const stats = getStats(items);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted(items.map((item) => item.publish_date)).reverse();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Daily regulatory watch</p>
          <h1>오늘의 법령·행정규칙 변경</h1>
        </div>
        <div className="run-info">
          <span>기준일 {run.last_target_date || "미수집"}</span>
          <span>최근 실행 {run.last_run_at ? new Date(run.last_run_at).toLocaleString("ko-KR") : "없음"}</span>
        </div>
      </header>

      <section className="stats-strip" aria-label="수집 통계">
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

      <ItemExplorer items={items} ministries={ministries} dates={dates} logs={run.logs || []} />
    </main>
  );
}
