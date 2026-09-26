import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
beforeAll(() => { process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres"; });

describe("Segredos cifrados (senha de app do Gmail)", () => {
  it("cifra e decifra; o texto gravado não contém a senha", async () => {
    const { open, seal } = await import("../secret-box");
    const sealed = seal("abcdefghijklmnop", "gmail-app-password");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("abcdefghijklmnop");
    expect(open(sealed, "gmail-app-password")).toBe("abcdefghijklmnop");
    expect(seal("abcdefghijklmnop", "gmail-app-password")).not.toBe(sealed); // IV aleatório
  });
  it("não decifra com outra finalidade, outro AUTH_SECRET ou valor adulterado", async () => {
    const { open, seal } = await import("../secret-box");
    const sealed = seal("abcdefghijklmnop", "gmail-app-password");
    expect(open(sealed, "outra")).toBeNull();
    expect(open(sealed.slice(0, -2) + "AA", "gmail-app-password")).toBeNull();
    process.env.AUTH_SECRET = "outro-segredo-completamente-diferente-123";
    expect(open(sealed, "gmail-app-password")).toBeNull();
  });
});
