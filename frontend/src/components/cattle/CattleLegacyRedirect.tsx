import { redirect } from "next/navigation";
import { cattleHref, cattleProduction, legacyCattleRoot } from "@/services/cattleNavigation";

/** Existing bookmarks retain every filter while leaving the retired URL tree. */
export function legacyCattlePage(suffix: string) {
  return async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const values = await searchParams;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (Array.isArray(value)) value.forEach(item => params.append(key, item));
      else if (value !== undefined) params.set(key, value);
    }
    const pathname = legacyCattleRoot + suffix;
    redirect(cattleHref(`${pathname}${params.size ? `?${params}` : ""}`, cattleProduction(pathname, params)));
  };
}
