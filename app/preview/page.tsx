import ItemExplorer from "@/components/ItemExplorer";
import { sortItems, uniqueSorted } from "@/lib/data";
import { previewItems } from "@/lib/previewData";

export default function PreviewPage() {
  const items = sortItems(previewItems);
  const ministries = uniqueSorted(items.map((item) => item.ministry));
  const dates = uniqueSorted(items.map((item) => item.collection_date || item.publish_date)).reverse();

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
      </header>

      <section className="overview-band" aria-label="샘플 화면 개요">
        <div className="overview-copy">
          <p className="eyebrow">Local app preview</p>
          <h1>Reg Watch Preview</h1>
          <p>샘플 데이터로 날짜 선택, 필터, 상세 화면의 흐름을 설치 없이 확인합니다.</p>
        </div>
      </section>

      <ItemExplorer
        items={items}
        ministries={ministries}
        dates={dates}
        detailHrefPrefix="/preview/items"
      />
    </main>
  );
}
