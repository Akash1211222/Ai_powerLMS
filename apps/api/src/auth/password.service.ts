import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Password hashing (§6, §39). Uses argon2id with tunable cost from env.
 * Verify is constant-time (argon2 handles this internally).
 */
@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  /**
   * A hash of a random string nobody can ever supply, used to spend the same
   * CPU when there is no stored hash to check against — see verifyDecoy.
   *
   * Started in the constructor rather than on first use so the cost is paid at
   * boot; otherwise the very first unknown-user login pays for the hash on top
   * of the verify, and stands out exactly as much as doing nothing would.
   */
  private readonly decoyHash: Promise<string | null>;

  constructor(config: ConfigService) {
    this.memoryCost = Number(config.get('ARGON2_MEMORY_COST') ?? 19456);
    this.timeCost = Number(config.get('ARGON2_TIME_COST') ?? 2);
    this.decoyHash = this.hash(randomBytes(32).toString('hex')).catch(() => null);
  }

  /**
   * Always false, but only after doing the work a real check would have done.
   *
   * Login answers "invalid email or password" either way, which is right — but
   * it used to answer far faster when the account did not exist, because
   * argon2 only ran when there was a hash to compare. That difference (6 ms
   * against 26 ms, measured) is enough to ask the server whether any given
   * address has an account, which for a school leaks the roster.
   */
  async verifyDecoy(plain: string): Promise<false> {
    const decoy = await this.decoyHash;
    if (decoy) await this.verify(decoy, plain);
    return false;
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}
