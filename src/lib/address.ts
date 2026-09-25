/* Endereços: o número do imóvel é sempre um campo próprio, separado do logradouro. */

const TRAILING_NUMBER = /^(.*\S)\s*,\s*(\d{1,6}[A-Za-z]?|[sS]\/[nN])\s*$/;

/**
 * Se o número não foi informado e o logradouro termina com ", 123" ou ", s/n", separa os dois.
 * Casos ambíguos (ex.: "Rod. SP-101, km 8") ficam como digitados.
 */
export function splitAddress<T extends { address?: string | null }>(data: T, numberKey: keyof T): T {
  const addr = data.address?.trim();
  const num = data[numberKey] as unknown as string | null | undefined;
  if (!addr || (num && String(num).trim())) return data;
  const m = addr.match(TRAILING_NUMBER);
  if (!m) return data;
  return { ...data, address: m[1], [numberKey]: m[2].toLowerCase() === "s/n" ? "s/n" : m[2] };
}

type AddressParts = {
  address?: string | null; number?: string | null; complement?: string | null;
  district?: string | null; city?: string | null; state?: string | null; zipCode?: string | null;
};

/** "Rua das Flores, 123 — Bloco B · Centro · Campinas/SP · 13000-000" (partes vazias omitidas). */
export function formatAddress(a: AddressParts, opts: { withCity?: boolean } = { withCity: true }) {
  const street = [a.address?.trim(), a.number?.trim()].filter(Boolean).join(", ");
  const line1 = [street, a.complement?.trim()].filter(Boolean).join(" — ");
  const city = a.city ? `${a.city}${a.state ? `/${a.state}` : ""}` : a.state ?? "";
  return [line1, a.district, ...(opts.withCity === false ? [] : [city, a.zipCode])].filter((x) => x && String(x).trim()).join(" · ");
}
