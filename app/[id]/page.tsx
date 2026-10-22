import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";
import { INDICATORS, byId } from "@/lib/indicators";

export const dynamicParams = false;
export function generateStaticParams() {
  return INDICATORS.map((i) => ({ id: i.id }));
}
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: byId(id).name };
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Dashboard id={id} />;
}
