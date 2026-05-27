import ItemExplorer from "@/components/ItemExplorer";
import { getStats, readAvailableDailyDates, readItems, readRunMetadata, sortItems, uniqueSorted } from "@/lib/data";

export default async function HomePage() {
  const items = sortItems(await readItems());
  const run = await readRunMetadata();
  const stats = getStats(items);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted([
    ...(await readAvailableDailyDates()),
    ...items.map((item) => item.collection_date || item.publish_date)
  ]).reverse();
  const currentDate = run.last_target_date || dates[0] || "미수집";
  const lastRun = run.last_run_at ? new Date(run.last_run_at).toLocaleString("ko-KR") : "최근 업데이트 없음";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="app-mark" aria-hidden="true">
            R
          </span>
          <div>
            <p>Reg Watch</p>
            <strong>규제 변경 모니터</strong>
          </div>
        </div>
        <div className="sync-status" aria-label="업데이트 상태">
          <span>{run.cache_hit ? "저장 자료" : "자동 업데이트"}</span>
          <strong>{currentDate}</strong>
          <small>{lastRun}</small>
        </div>
      </header>

      <section className="overview-band" aria-label="서비스 개요">
        <div className="overview-copy">
          <p className="eyebrow">Daily regulatory intelligence</p>
          <h1>오늘의 규제 변경</h1>
          <p>법령, 고시, 지침, 예고 자료를 기준일별로 정리했습니다.</p>
        </div>
        <div className="overview-metrics" aria-label="수집 통계">
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

      <ItemExplorer items={items} ministries={ministries} dates={dates} logs={run.logs || []} run={run} />
    </main>
  );
}
