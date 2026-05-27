import ItemExplorer from "@/components/ItemExplorer";
import { readAvailableDailyDates, readItems, sortItems, uniqueSorted } from "@/lib/data";

export default async function HomePage() {
  const items = sortItems(await readItems());
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted([
    ...(await readAvailableDailyDates()),
    ...items.map((item) => item.collection_date || item.publish_date)
  ]).reverse();

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
      </header>

      <section className="overview-band" aria-label="서비스 개요">
        <div className="overview-copy">
          <p className="eyebrow">Regulatory intelligence</p>
          <h1>Reg Watch</h1>
          <p>법령, 고시, 지침, 뉴스와 발언을 날짜별로 모아 빠르게 확인하는 규제 변경 모니터입니다.</p>
        </div>
      </section>

      <ItemExplorer items={items} ministries={ministries} dates={dates} />
    </main>
  );
}
