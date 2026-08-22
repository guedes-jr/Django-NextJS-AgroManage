import { redirect } from "next/navigation";


export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const destination = new URLSearchParams({ view: "register" });

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") destination.set(key, value);
    else if (Array.isArray(value)) value.forEach((item) => destination.append(key, item));
  }

  redirect(`/login?${destination.toString()}`);
}
