import { notFound } from "next/navigation";
import ItemDetailView from "@/components/ItemDetailView";
import { readItems } from "@/lib/data";

export const dynamicParams = false;

export async function generateStaticParams() {
  const items = await readItems();
  return items.map((item) => ({ id: item.id }));
}

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await readItems();
  const item = items.find((entry) => entry.id === id);
  if (!item) notFound();

  return <ItemDetailView item={item} backHref="/" />;
}
