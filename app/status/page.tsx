import Link from "next/link";
import CollectionStatusBoard from "@/components/CollectionStatusBoard";
import { readCollectionStatusReport } from "@/lib/collectionStatus";

export default async function StatusPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const report = await readCollectionStatusReport();

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
          수집 기록이 있는 날짜의 결과와 수집방법별 성공·오류 로그를 확인합니다.
          성공한 수집방법은 수집 건수로, 실패한 수집방법은 오류 또는 외부 접속 장애로 표시합니다.
        </p>
      </section>

      <CollectionStatusBoard report={report} />
    </main>
  );
}
