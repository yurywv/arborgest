import { describe, expect, it } from "vitest";
import { formatAddress, splitAddress } from "../address";

describe("Endereço: número separado do logradouro", () => {
  it("separa número digitado no fim do logradouro quando o campo número está vazio", () => {
    expect(splitAddress({ address: "Rua das Flores, 123", addressNumber: null }, "addressNumber")).toEqual({ address: "Rua das Flores", addressNumber: "123" });
    expect(splitAddress({ address: "Praça da Matriz, S/N", number: "" }, "number")).toEqual({ address: "Praça da Matriz", number: "s/n" });
    expect(splitAddress({ address: "Av. Brasil,1500A", number: null }, "number")).toEqual({ address: "Av. Brasil", number: "1500A" });
  });
  it("não altera quando o número já foi informado ou o final é ambíguo", () => {
    expect(splitAddress({ address: "Rua A, 10", number: "20" }, "number")).toEqual({ address: "Rua A, 10", number: "20" });
    expect(splitAddress({ address: "Rod. SP-101, km 8", number: null }, "number")).toEqual({ address: "Rod. SP-101, km 8", number: null });
    expect(splitAddress({ address: "Rua 7 de Setembro", number: null }, "number")).toEqual({ address: "Rua 7 de Setembro", number: null });
  });
  it("formata o endereço com número, complemento, bairro e cidade", () => {
    expect(formatAddress({ address: "Rua das Flores", number: "123", complement: "Bloco B", district: "Centro", city: "Campinas", state: "SP", zipCode: "13000-000" }))
      .toBe("Rua das Flores, 123 — Bloco B · Centro · Campinas/SP · 13000-000");
    expect(formatAddress({ address: "Rua X", number: null, city: "Sumaré", state: "SP" })).toBe("Rua X · Sumaré/SP");
  });
});
