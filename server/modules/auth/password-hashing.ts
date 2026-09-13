import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing: scrypt from Node's crypto module.
 *
 * Why scrypt: it is a memory-hard password KDF that Node ships natively, so it
 * behaves identically on every platform the Vault runs on (local, Replit) with
 * no native build step. Parameters follow the OWASP recommendation for scrypt
 * (N=2^16, r=8, p=2 is one of the listed equivalents of N=2^17, r=8, p=1) and
 * use 64 MiB of memory per hash.
 *
 * Stored format (all fields self-describing, so parameters can be raised and
 * credentials rehashed on next login without a schema change):
 *
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 *
 * A future Argon2id implementation would use a different prefix and the same
 * verify/needsRehash entry points.
 */
export const SCRYPT_PARAMETERS = {
  N: 2 ** 16,
  r: 8,
  p: 2,
  keyLength: 32,
  saltLength: 16,
} as const;

const SCHEME = "scrypt";

function base64url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number; keyLength: number },
): Promise<Buffer> {
  const maxmem = 128 * params.N * params.r * 2;
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      params.keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_PARAMETERS.saltLength);
  const hash = await derive(password, salt, SCRYPT_PARAMETERS);
  const { N, r, p } = SCRYPT_PARAMETERS;
  return [SCHEME, N, r, p, base64url(salt), base64url(hash)].join("$");
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): ParsedHash | undefined {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== SCHEME) return undefined;
  const [, n, r, p, salt, hash] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (![N, R, P].every((v) => Number.isInteger(v) && v > 0)) return undefined;
  return {
    N,
    r: R,
    p: P,
    salt: Buffer.from(salt, "base64url"),
    hash: Buffer.from(hash, "base64url"),
  };
}

/** Constant-time comparison; an unparseable stored value never verifies. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await derive(password, parsed.salt, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    keyLength: parsed.hash.length,
  });
  return (
    candidate.length === parsed.hash.length &&
    timingSafeEqual(candidate, parsed.hash)
  );
}

/** True when the stored hash was made with weaker or different parameters. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return (
    parsed.N !== SCRYPT_PARAMETERS.N ||
    parsed.r !== SCRYPT_PARAMETERS.r ||
    parsed.p !== SCRYPT_PARAMETERS.p ||
    parsed.hash.length !== SCRYPT_PARAMETERS.keyLength
  );
}

let dummyHash: Promise<string> | undefined;

/**
 * A real hash of a random value, verified against when the email is unknown
 * so a failed login costs the same time whether or not the account exists.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}
