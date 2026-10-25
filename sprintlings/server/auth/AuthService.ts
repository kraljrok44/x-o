import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createProfile } from '../../src/economy/Profile';
import { HttpError, type Request } from '../api/http';
import type { Account, Repository } from '../persistence/Repository';

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Guest accounts with an opaque bearer token (only its hash is stored).
 * A portal/OAuth login can later be linked to the same account id.
 */
export class AuthService {
  constructor(private readonly repo: Repository) {}

  async createGuest(now: number): Promise<{ token: string; accountId: string }> {
    const token = randomBytes(32).toString('base64url');
    const account: Account = { id: `acc_${randomUUID()}`, tokenHash: hashToken(token), createdAt: now };
    await this.repo.createAccount(account, createProfile(account.id, now));
    return { token, accountId: account.id };
  }

  async authenticate(req: Request): Promise<Account> {
    const h = String(req.headers.authorization ?? '');
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new HttpError(401, 'unauthorized', 'Missing token');
    const acc = await this.repo.accountByToken(hashToken(token));
    if (!acc) throw new HttpError(401, 'unauthorized', 'Invalid token');
    return acc;
  }
}
