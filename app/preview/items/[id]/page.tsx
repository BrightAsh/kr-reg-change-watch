import { notFound } from "next/navigation";
import ItemDetailView from "@/components/ItemDetailView";
import { previewItems } from "@/lib/previewData";

export const dynamicParams = false;

export function generateStaticParams() {
  return previewItems.map((item) => ({ id: item.id }));
}

export default async function PreviewItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = previewItems.find((entry) => entry.id === id);
  if (!item) notFound();

  return <ItemDetailView item={item} backHref="/preview" backLabel="미리보기 목록으로" />;
}
