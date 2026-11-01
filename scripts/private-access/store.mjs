import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';

const derive = promisify(scrypt);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(32).toString('hex');
const fail = (message, status = 400) => Object.assign(Error(message), { status });
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const usernameOf = (value) => {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(value))
    throw fail('A felhasználónév 3–40 kisbetű, szám, pont, kötőjel vagy aláhúzás lehet.');
  return value;
};
function passwordOf(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 256)
    throw fail('Legalább 12 karakteres, legfeljebb 256 bájtos jelszót adj meg.');
  return value;
}
async function passwordHash(password, salt = token()) {
  return {
    salt,
    hash: Buffer.from(await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString(
      'hex',
    ),
  };
}
async function matches(password, record) {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 256) return false;
  const result = await passwordHash(password, record?.salt || 'private-access-dummy-salt');
  return equal(result.hash, record?.hash || '0'.repeat(128));
}
const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  disabled: user.disabled,
  createdAt: user.createdAt,
});

export async function openPrivateAccess(directory, { now = Date.now } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const file = join(directory, 'access-v1.json'),
    enrollment = join(directory, 'owner-enrollment');
  let state;
  try {
    state = JSON.parse(await readFile(file, 'utf8'));
    if (
      state.version !== 1 ||
      !Array.isArray(state.users) ||
      !Array.isArray(state.sessions) ||
      !Array.isArray(state.invites) ||
      state.users.filter((u) => u.role === 'owner').length > 1
    )
      throw Error('Invalid access database');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let initial;
    try {
      initial = (await readFile(enrollment, 'utf8')).trim();
      if (!/^[a-f0-9]{64}$/.test(initial)) throw Error('Invalid owner enrollment');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      initial = token();
      await writeFile(enrollment, initial, { mode: 0o600, flag: 'wx' });
    }
    state = { version: 1, users: [], sessions: [], invites: [], ownerEnrollmentHash: digest(initial) };
    await writeFile(file, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  }
  let queue = Promise.resolve();
  async function transaction(fn) {
    const task = queue.then(async () => {
      const next = structuredClone(state);
      next.sessions = next.sessions.filter((s) => s.expiresAt > now());
      next.invites = next.invites.filter((i) => i.expiresAt > now());
      const result = await fn(next),
        temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
        await rename(temporary, file);
      } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
      state = next;
      return result;
    });
    queue = task.catch(() => {});
    return task;
  }
  function addSession(next, user) {
    const secret = token();
    next.sessions.push({ hash: digest(secret), userId: user.id, expiresAt: now() + 7 * 86400000 });
    return { secret, user: publicUser(user) };
  }
  return {
    ready: () => state.users.some((u) => u.role === 'owner'),
    session(secret) {
      if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) return null;
      const session = state.sessions.find((s) => equal(s.hash, digest(secret)) && s.expiresAt > now());
      const user = session && state.users.find((u) => u.id === session.userId && !u.disabled);
      return user ? publicUser(user) : null;
    },
    async login(username, password) {
      const user = state.users.find((u) => u.username === username && !u.disabled);
      if (!(await matches(password, user?.password)) || !user) throw fail('Hibás felhasználónév vagy jelszó.', 401);
      return transaction((next) => {
        const current = next.users.find((u) => u.id === user.id && !u.disabled);
        if (!current || current.password.hash !== user.password.hash) throw fail('Jelentkezz be újra.', 401);
        return addSession(next, current);
      });
    },
    async enroll(username, password, invitation) {
      username = usernameOf(username);
      passwordOf(password);
      if (typeof invitation !== 'string' || !/^[a-f0-9]{64}$/.test(invitation))
        throw fail('A meghívó nem érvényes vagy már lejárt.', 403);
      const result = await transaction(async (next) => {
        const ownerSetup =
          !next.users.some((u) => u.role === 'owner') && equal(next.ownerEnrollmentHash, digest(invitation));
        const invite = next.invites.find(
          (i) => equal(i.hash, digest(invitation)) && i.expiresAt > now() && i.username === username,
        );
        if (!ownerSetup && !invite) throw fail('A meghívó nem érvényes vagy már lejárt.', 403);
        let user = next.users.find((u) => u.username === username);
        if ((ownerSetup && user) || (!ownerSetup && user?.role === 'owner'))
          throw fail('Ez a felhasználónév már foglalt.', 409);
        if (!user) {
          user = { id: randomUUID(), username, role: ownerSetup ? 'owner' : 'member', createdAt: now() };
          next.users.push(user);
        }
        user.password = await passwordHash(password);
        user.disabled = false;
        next.sessions = next.sessions.filter((s) => s.userId !== user.id);
        next.invites = next.invites.filter((i) => i.username !== username);
        if (ownerSetup) next.ownerEnrollmentHash = null;
        return addSession(next, user);
      });
      if (result.user.role === 'owner') await unlink(enrollment).catch(() => {});
      return result;
    },
    list(owner) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      return {
        users: state.users.map(publicUser),
        invites: state.invites
          .filter((i) => i.expiresAt > now())
          .map(({ username, expiresAt }) => ({ username, expiresAt })),
      };
    },
    async invite(owner, username) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      username = usernameOf(username);
      return transaction((next) => {
        if (next.users.some((u) => u.username === username && u.role === 'owner'))
          throw fail('A tulajdonos belépését a saját fiókjában módosíthatja.');
        const secret = token(),
          expiresAt = now() + 3 * 86400000;
        next.invites = next.invites.filter((i) => i.username !== username);
        next.invites.push({ username, hash: digest(secret), expiresAt });
        return { secret, username, expiresAt };
      });
    },
    async revoke(owner, username) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      return transaction((next) => {
        const user = next.users.find((u) => u.username === username);
        if (user?.role === 'owner') throw fail('A saját tulajdonosi hozzáférésed itt nem vonható vissza.');
        if (user) {
          user.disabled = true;
          next.sessions = next.sessions.filter((s) => s.userId !== user.id);
        }
        next.invites = next.invites.filter((i) => i.username !== username);
      });
    },
    async changePassword(actor, oldPassword, newPassword) {
      passwordOf(newPassword);
      return transaction(async (next) => {
        const user = next.users.find((u) => u.id === actor?.id && !u.disabled);
        if (!user || !(await matches(oldPassword, user.password))) throw fail('A jelenlegi jelszó nem megfelelő.', 403);
        user.password = await passwordHash(newPassword);
        next.sessions = next.sessions.filter((s) => s.userId !== user.id);
      });
    },
    async logout(secret) {
      if (typeof secret === 'string')
        await transaction((next) => {
          next.sessions = next.sessions.filter((s) => !equal(s.hash, digest(secret)));
        });
    },
  };
}
