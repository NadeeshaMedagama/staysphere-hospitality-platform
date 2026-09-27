import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters follow OWASP's 2024 password-storage guidance
 * (19 MiB memory, 2 iterations, 1 degree of parallelism), which resists both
 * GPU and side-channel attacks at a latency the login path can absorb.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  async hash(plainText: string): Promise<string> {
    return hash(plainText, ARGON2_OPTIONS);
  }

  /**
   * Verifies a password. A malformed or absent stored hash returns false rather
   * than throwing, so a corrupt row cannot turn into a 500 that distinguishes it
   * from an ordinary wrong password.
   */
  async verify(storedHash: string, plainText: string): Promise<boolean> {
    try {
      return await verify(storedHash, plainText, ARGON2_OPTIONS);
    } catch {
      return false;
    }
  }
}
