import ItemExplorer from "@/components/ItemExplorer";
import MailAlertDialog from "@/components/MailAlertDialog";
import { readAvailableDailyDates, readItems, sortItems, uniqueSorted } from "@/lib/data";

export default async function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
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
          <img className="brand-logo" src={`${basePath}/knoc.png`} alt="한국석유공사 로고" />
          <div>
            <p>한국석유공사</p>
            <strong>법령·고시·지침 모니터링</strong>
          </div>
        </div>
        <MailAlertDialog ministries={ministries} />
      </header>

      <section className="overview-band" aria-label="서비스 개요">
        <div className="overview-copy">
          <p className="eyebrow">KNOC Policy & Regulatory Intelligence</p>
          <h1>법령·고시·지침 일일 모니터링</h1>
          <p>
            공공기관 운영과 에너지·산업 정책에 영향을 줄 수 있는 법령, 고시, 공고, 지침, 정책자료를
            날짜별로 수집해 한 화면에서 확인합니다.
          </p>
        </div>
      </section>

      <ItemExplorer items={items} ministries={ministries} dates={dates} />
    </main>
  );
}
