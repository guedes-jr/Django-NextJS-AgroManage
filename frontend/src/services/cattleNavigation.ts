/** Web segments are independent from the internal bovinos species/API code. */
export type CattleProduction = "beef" | "dairy";
export const legacyCattleRoot = "/home/seguimento/bovinos";
const homes = { beef: "/home/seguimento/gado-de-corte", dairy: "/home/seguimento/pecuaria-leiteira" };
export const cattleRoot = homes.beef;
const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

export function canonicalSegmentPath(pathname: string) {
  return pathname.replace(/^\/home\/rebanho(?=\/|$)/, "/home/seguimento");
}
export function isCattlePath(pathname: string) {
  pathname = canonicalSegmentPath(pathname);
  return within(pathname, legacyCattleRoot) || Object.values(homes).some(root => within(pathname, root));
}
export function cattleProduction(pathname: string, params?: Pick<URLSearchParams, "get"> | null): CattleProduction {
  pathname = canonicalSegmentPath(pathname);
  if (within(pathname, homes.dairy) || within(pathname, `${legacyCattleRoot}/pecuaria-leiteira`) || pathname === `${legacyCattleRoot}/leite`) return "dairy";
  if (within(pathname, homes.beef) || pathname === `${legacyCattleRoot}/corte`) return "beef";
  const production = params?.get("production");
  if (production === "beef" || production === "dairy") return production;
  return params?.get("tab") === "milk-trends" ? "dairy" : "beef";
}
export function cattleHome(production: CattleProduction) { return homes[production]; }

/** Canonical links retain filters but encode the production segment in the path. */
export function cattleHref(href: string, production: CattleProduction) {
  const [pathAndQuery, hash] = href.split("#", 2);
  const [sourcePath, query = ""] = pathAndQuery.split("?", 2);
  const pathname = canonicalSegmentPath(sourcePath);
  if (!isCattlePath(pathname)) return href;
  let segment = production;
  let suffix: string;
  if (within(pathname, `${legacyCattleRoot}/pecuaria-leiteira`)) {
    segment = "dairy";
    suffix = pathname.slice(`${legacyCattleRoot}/pecuaria-leiteira`.length);
  } else if (pathname === `${legacyCattleRoot}/corte`) {
    segment = "beef"; suffix = "";
  } else {
    const root = [homes.beef, homes.dairy, legacyCattleRoot].find(root => within(pathname, root))!;
    suffix = pathname.slice(root.length);
  }
  if (suffix === "/leite") segment = "dairy";
  if (suffix === "/animais") suffix = "/cadastro";
  const params = new URLSearchParams(query);
  params.delete("production");
  const search = params.toString();
  return `${cattleHome(segment)}${suffix}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}
export function cattleParent(pathname: string, params?: Pick<URLSearchParams, "get"> | null) {
  const production = cattleProduction(pathname, params);
  const href = cattleHome(production);
  return pathname === href ? null : { href, label: `Voltar para ${production === "dairy" ? "Pecuária leiteira" : "Gado de corte"}` };
}
/** Normalize only web access checks; existing species scopes remain authoritative. */
export function cattleAccessPath(pathname: string) {
  pathname = canonicalSegmentPath(pathname);
  for (const root of Object.values(homes)) {
    if (within(pathname, root)) return legacyCattleRoot + pathname.slice(root.length);
  }
  return pathname;
}
