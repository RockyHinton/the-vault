import { describe, expect, it } from "vitest";
import {
  SCRYPT_PARAMETERS,
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../../server/modules/auth/password-hashing";

describe("password hashing", () => {
  it("produces a self-describing scrypt hash with a unique salt", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
    const [scheme, n, r, p, salt, hash] = first.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBe(SCRYPT_PARAMETERS.N);
    expect(Number(r)).toBe(SCRYPT_PARAMETERS.r);
    expect(Number(p)).toBe(SCRYPT_PARAMETERS.p);
    expect(Buffer.from(salt, "base64url")).toHaveLength(
      SCRYPT_PARAMETERS.saltLength,
    );
    expect(Buffer.from(hash, "base64url")).toHaveLength(
      SCRYPT_PARAMETERS.keyLength,
    );
    expect(first).not.toContain("correct horse");
  });

  it("verifies the right password and rejects wrong, empty and near-miss ones", async () => {
    const stored = await hashPassword("Tr0ub4dor&3-long-enough");
    expect(await verifyPassword("Tr0ub4dor&3-long-enough", stored)).toBe(true);
    expect(await verifyPassword("Tr0ub4dor&3-long-enough ", stored)).toBe(
      false,
    );
    expect(await verifyPassword("tr0ub4dor&3-long-enough", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("never verifies against a malformed or foreign stored value", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "plaintext-password")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$2b$12$abc")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$x$8$2$salt$hash")).toBe(
      false,
    );
  });

  it("flags hashes made with other parameters for rehashing", async () => {
    const current = await hashPassword("some-password-value");
    expect(needsRehash(current)).toBe(false);
    const weaker = current.replace(
      `scrypt$${SCRYPT_PARAMETERS.N}$`,
      "scrypt$16384$",
    );
    expect(needsRehash(weaker)).toBe(true);
    expect(needsRehash("not-a-hash")).toBe(true);
  });

  it("keeps a stable dummy hash for constant-time unknown-user failures", async () => {
    const a = await dummyPasswordHash();
    const b = await dummyPasswordHash();
    expect(a).toBe(b);
    expect(await verifyPassword("password", a)).toBe(false);
  });
});
