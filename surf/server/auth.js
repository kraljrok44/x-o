// Player identity.
// - Guests: the client keeps a random secret token; the server keys the profile by its hash.
// - CrazyGames accounts: the SDK user token (RS256 JWT) is verified with CrazyGames' public key,
//   so the inventory follows the account across devices.

import crypto from 'node:crypto';

const CG_KEY_URL = 'https://sdk.crazygames.com/publicKey.json';
let cgKey = null;
let cgKeyAt = 0;

async function crazyPublicKey() {
  if (cgKey && Date.now() - cgKeyAt < 6 * 3600 * 1000) return cgKey;
  const res = await fetch(CG_KEY_URL);
  const json = await res.json();
  cgKey = json.publicKey;
  cgKeyAt = Date.now();
  return cgKey;
}

function b64urlJson(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

export async function verifyCrazyToken(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const header = b64urlJson(parts[0]);
  if (header.alg !== 'RS256') return null;
  const key = await crazyPublicKey();
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!ok) return null;
  const payload = b64urlJson(parts[1]);
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  if (!payload.userId) return null;
  return { userId: String(payload.userId), username: payload.username };
}

export async function authenticate(hello) {
  if (hello.cgToken) {
    try {
      const u = await verifyCrazyToken(hello.cgToken);
      if (u) return { key: 'cg:' + u.userId, name: u.username || hello.name };
    } catch (e) {
      // fall back to guest identity
    }
  }
  const token = String(hello.token || '');
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
  return { key: 'g:' + crypto.createHash('sha256').update(token).digest('hex'), name: hello.name };
}
