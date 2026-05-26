import ItemExplorer from "@/components/ItemExplorer";
import { getStats, readAvailableDailyDates, readItems, readRunMetadata, sortItems, uniqueSorted } from "@/lib/data";

const actionsHref = "https://github.com/BrightAsh/kr-reg-change-watch/actions/workflows/daily-collect.yml";
const repoHref = "https://github.com/BrightAsh/kr-reg-change-watch";

export default async function HomePage() {
  const items = sortItems(await readItems());
  const run = await readRunMetadata();
  const stats = getStats(items);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted([...(await readAvailableDailyDates()), ...items.map((item) => item.publish_date)]).reverse();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Daily regulatory watch</p>
          <h1>한국 규제·법령 변경 모니터</h1>
        </div>
        <div className="run-info" aria-label="실행 상태">
          <span className="status-chip">{run.cache_hit ? "캐시 조회" : "자동 수집"}</span>
          <span>기준일 {run.last_target_date || "미수집"}</span>
          <span>{run.last_run_at ? new Date(run.last_run_at).toLocaleString("ko-KR") : "최근 실행 없음"}</span>
          <nav className="header-actions" aria-label="외부 작업">
            <a href={actionsHref} target="_blank" rel="noreferrer">
              수동 수집
            </a>
            <a href={repoHref} target="_blank" rel="noreferrer">
              저장소
            </a>
          </nav>
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

      <ItemExplorer items={items} ministries={ministries} dates={dates} logs={run.logs || []} run={run} />
    </main>
  );
}
