import { notFound } from "next/navigation";
import ItemDetailView from "@/components/ItemDetailView";
import { readItems } from "@/lib/data";

const emptyParam = "__empty__";

export const dynamicParams = false;

export async function generateStaticParams() {
  const items = await readItems();
  return items.length ? items.map((item) => ({ id: item.id })) : [{ id: emptyParam }];
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await readItems();
  const item = items.find((entry) => entry.id === id);
  if (id === emptyParam) {
    return (
      <main className="page-shell detail-shell">
        <div className="empty-state">
          <strong>아직 수집된 항목이 없습니다.</strong>
          <span>일자별 수집이 완료되면 상세 페이지가 생성됩니다.</span>
        </div>
      </main>
    );
  }
  if (!item) notFound();

  return <ItemDetailView item={item} backHref="/" />;
}
