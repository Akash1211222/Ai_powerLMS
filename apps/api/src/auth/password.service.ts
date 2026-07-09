import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

/**
 * Password hashing (§6, §39). Uses argon2id with tunable cost from env.
 * Verify is constant-time (argon2 handles this internally).
 */
@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;

  constructor(config: ConfigService) {
    this.memoryCost = Number(config.get('ARGON2_MEMORY_COST') ?? 19456);
    this.timeCost = Number(config.get('ARGON2_TIME_COST') ?? 2);
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
