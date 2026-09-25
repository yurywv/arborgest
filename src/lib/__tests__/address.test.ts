import { describe, expect, it } from "vitest";
import { formatAddress } from "../address";

describe("Endereço: formatação com número separado do logradouro", () => {
  it("formata o endereço com número, complemento, bairro e cidade", () => {
    expect(formatAddress({ address: "Rua das Flores", number: "123", complement: "Bloco B", district: "Centro", city: "Campinas", state: "SP", zipCode: "13000-000" }))
      .toBe("Rua das Flores, 123 — Bloco B · Centro · Campinas/SP · 13000-000");
    expect(formatAddress({ address: "Rua X", number: null, city: "Sumaré", state: "SP" })).toBe("Rua X · Sumaré/SP");
  });
});
