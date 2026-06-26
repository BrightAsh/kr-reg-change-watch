import Link from "next/link";
import ItemExplorer from "@/components/ItemExplorer";
import MailAlertDialog from "@/components/MailAlertDialog";
import {
  readAvailableDailyDates,
  readAvailableDataDailyDates,
  readDataItems,
  readItems,
  sortItems,
  uniqueSorted
} from "@/lib/data";

export default async function HomePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const items = sortItems(await readItems());
  const dataItems = sortItems(await readDataItems());
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dataMinistries = uniqueSorted(dataItems.map((item) => item.ministry));
  const dates = uniqueSorted([
    ...(await readAvailableDailyDates()),
    ...items.map((item) => item.collection_date || item.publish_date)
  ]).reverse();
  const dataDates = uniqueSorted([
    ...(await readAvailableDataDailyDates()),
    ...dataItems.map((item) => item.collection_date || item.publish_date)
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
        <div className="header-actions">
          <Link className="header-button" href="/status">
            수집 현황
          </Link>
          <MailAlertDialog ministries={ministries} />
        </div>
      </header>

      <section className="overview-band" aria-label="서비스 개요">
        <div className="overview-copy">
          <p className="eyebrow">KNOC Policy & Regulatory Intelligence</p>
          <h1>법령·고시·지침 일일 모니터링</h1>
          <p>
            지정된 정부·공공기관 출처에서 법령, 고시, 공고, 지침, 입법·행정예고, 정책자료를 날짜별로
            수집해 한 화면에서 확인합니다.
          </p>
        </div>
      </section>

      <ItemExplorer
        items={items}
        ministries={ministries}
        dates={dates}
        dataItems={dataItems}
        dataMinistries={dataMinistries}
        dataDates={dataDates}
      />
    </main>
  );
}
