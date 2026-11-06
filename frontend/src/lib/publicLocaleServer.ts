import "server-only";
import { headers } from "next/headers";
import { resolvePublicLanguage, translatePublicMessage, type PublicTranslator } from "./publicMessages";

export async function getPublicTranslator() {
  const language = resolvePublicLanguage((await headers()).get("accept-language") ?? "");
  const t: PublicTranslator = (key, values) => translatePublicMessage(language, key, values);
  return { language, t };
}
