import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const { group } = await searchParams;
  const query = group ? `?group=${encodeURIComponent(group)}` : "";
  redirect(`/home/rebanho/bovinos/pecuaria-leiteira/cadastro${query}`);
}
