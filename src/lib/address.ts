/* Endereços: o número do imóvel é sempre um campo próprio, separado do logradouro. */

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
