function dimensionInCentimeters(value: string | null | undefined): bigint | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(value?.trim().replace(",", ".") ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  return BigInt((match[1] || "0") + (match[2] ?? "").padEnd(2, "0"));
}

export function calculateBuiltArea(length: string | null | undefined, width: string | null | undefined): string | null {
  const lengthCm = dimensionInCentimeters(length);
  const widthCm = dimensionInCentimeters(width);
  if (lengthCm === null || widthCm === null) return null;

  const hundred = BigInt(100);
  const areaCents = (lengthCm * widthCm + BigInt(50)) / hundred;
  return `${areaCents / hundred}.${String(areaCents % hundred).padStart(2, "0")}`;
}
