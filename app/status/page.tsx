import Link from "next/link";
import CollectionStatusBoard from "@/components/CollectionStatusBoard";
import { readCollectionStatusReport } from "@/lib/collectionStatus";
import { readDataCollectionStatusReport } from "@/lib/dataCollectionStatus";

export default async function StatusPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const report = await readCollectionStatusReport();
  const dataReport = await readDataCollectionStatusReport();

  return (
    <main className="page-shell status-page">
      <header className="app-header">
        <Link className="brand-lockup" href="/">
          <img className="brand-logo" src={`${basePath}/knoc.png`} alt="한국석유공사 로고" />
          <div>
            <p>한국석유공사</p>
            <strong>수집 현황</strong>
          </div>
        </Link>
        <div className="header-actions">
          <Link className="header-button" href="/">
            자료 목록
          </Link>
        </div>
      </header>

      <section className="status-hero" aria-label="수집 현황 안내">
        <p className="eyebrow">Collection Health</p>
        <h1>날짜별 수집 현황</h1>
        <p>
          기본 수집과 데이터 수집 결과를 날짜별 전체 현황으로 합산해 보여줍니다. 각 날짜의 수집방법별 성공·오류 로그를
          한 화면에서 확인합니다.
        </p>
      </section>

      <CollectionStatusBoard report={report} dataReport={dataReport} />
    </main>
  );
}
