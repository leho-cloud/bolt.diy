import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { addCredits, creditAccount, paidCheckoutCreditGrant, recordCreditUsage } from './credits.mjs';
import { workspaceDefaults } from './workspace-preferences.mjs';

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
function registrationContact(name, email) {
  name = typeof name === 'string' ? name.trim() : '';
  email = typeof email === 'string' ? email.trim() : '';
  if (!name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name))
    throw fail('Adj meg egy legfeljebb 100 karakteres nevet.');
  if (email.length > 254 || !/^[^\s@<>\x00-\x1f\x7f]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email))
    throw fail('Adj meg egy érvényes e-mail-címet az egyeztetéshez.');
  return { name, email };
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
      (state.registrations !== undefined && !Array.isArray(state.registrations)) ||
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
  state.registrations ??= [];
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
    credits(actor) {
      return creditAccount(state.users.find((entry) => entry.id === actor.id));
    },
    async recordUsage(accountId, requestId, total) {
      return transaction((next) => {
        const user = next.users.find((entry) => entry.id === accountId);
        if (!user) return false;
        recordCreditUsage(user, requestId, total, now());
        return true;
      });
    },
    async grantCredits(owner, username, credits, receipt) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      if (typeof receipt !== 'string' || !/^[a-f0-9-]{36}$/.test(receipt))
        throw fail('A jóváírási űrlap lejárt. Nyisd meg újra a felületet.');
      if (!Number.isSafeInteger(credits) || credits < 1 || credits > 1_000_000)
        throw fail('Adj meg egy egész kreditmennyiséget 1 és 1 000 000 között.');
      return transaction((next) => {
        const user = next.users.find((entry) => entry.username === username && !entry.disabled);
        if (!user) throw fail('A felhasználói fiók nem érhető el.', 404);
        addCredits(user, credits, 'manual:' + receipt);
      });
    },
    async fulfillPaidCheckout(session, creditsByPrice) {
      const grant = paidCheckoutCreditGrant(session, creditsByPrice);
      if (!grant) return false;
      return transaction((next) => {
        const user = next.users.find((entry) => entry.id === grant.accountId);
        return user ? addCredits(user, grant.credits, grant.receipt) : false;
      });
    },
    workspace(actor, project) {
      const user = state.users.find((entry) => entry.id === actor.id && !entry.disabled);
      const preferences = user?.workspacePreferences || workspaceDefaults;
      const memory = project && user?.projectMemory && Object.hasOwn(user.projectMemory, project)
        ? user.projectMemory[project]
        : undefined;
      return { preferences, memory, projects: Object.keys(user?.projectMemory || {}) };
    },
    async updateWorkspace(actor, preferences) {
      await transaction((next) => {
        const user = next.users.find((entry) => entry.id === actor.id && !entry.disabled);
        if (!user) throw fail('Jelentkezz be újra.', 401);
        user.workspacePreferences = preferences;
      });
    },
    async updateProjectMemory(actor, project, value) {
      await transaction((next) => {
        const user = next.users.find((entry) => entry.id === actor.id && !entry.disabled);
        if (!user) throw fail('Jelentkezz be újra.', 401);
        user.projectMemory ??= {};
        if (value === null) {
          delete user.projectMemory[project];
          return;
        }
        if (!Object.hasOwn(user.projectMemory, project) && Object.keys(user.projectMemory).length >= 100)
          throw fail('Elérted a 100 mentett projektmemória határát. Törölj egy meglévő projektmemóriát.');
        const previous = Object.hasOwn(user.projectMemory, project) ? user.projectMemory[project] : {};
        Object.defineProperty(user.projectMemory, project, {
          value: { ...value, repairs: previous.repairs || [] }, enumerable: true, configurable: true, writable: true,
        });
      });
    },
    async rememberRepair(actor, project, repair) {
      await transaction((next) => {
        const user = next.users.find((entry) => entry.id === actor.id && !entry.disabled);
        if (!user?.workspacePreferences?.memoryEnabled) return;
        user.projectMemory ??= {};
        const previous = Object.hasOwn(user.projectMemory, project) ? user.projectMemory[project] : { notes: '' };
        if (previous.repairs?.some((item) => item.id === repair.id)) return;
        if (!Object.hasOwn(user.projectMemory, project) && Object.keys(user.projectMemory).length >= 100) return;
        Object.defineProperty(user.projectMemory, project, {
          value: { ...previous, repairs: [...(previous.repairs || []), repair].slice(-5) },
          enumerable: true, configurable: true, writable: true,
        });
      });
    },
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
        next.registrations = next.registrations.filter((entry) => entry.username !== username);
        if (ownerSetup) next.ownerEnrollmentHash = null;
        return addSession(next, user);
      });
      if (result.user.role === 'owner') await unlink(enrollment).catch(() => {});
      return result;
    },
    async register({ username, name, email, password }) {
      username = usernameOf(username);
      passwordOf(password);
      const contact = registrationContact(name, email);
      return transaction(async (next) => {
        if (!next.users.some((u) => u.role === 'owner')) throw fail('A regisztráció jelenleg nem érhető el.', 503);
        const sameEmail = (entry) => entry.email?.toLowerCase() === contact.email.toLowerCase();
        if (
          next.users.some((u) => u.username === username || sameEmail(u)) ||
          next.invites.some((invite) => invite.username === username) ||
          next.registrations.some((entry) => entry.username === username || sameEmail(entry))
        ) {
          throw fail('Ezekkel az adatokkal már van fiók, meghívó vagy függő kérelem.', 409);
        }
        next.registrations.push({
          id: randomUUID(),
          username,
          ...contact,
          password: await passwordHash(password),
          requestedAt: now(),
        });
      });
    },
    async reviewRegistration(owner, id, approve) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      return transaction((next) => {
        const index = next.registrations.findIndex((entry) => entry.id === id);
        if (index < 0) throw fail('Ez a kérelem már nincs a várakozók között.', 404);
        const entry = next.registrations[index];
        if (approve) {
          if (next.users.some((u) => u.username === entry.username))
            throw fail('Ez a felhasználónév már foglalt.', 409);
          next.users.push({
            id: entry.id,
            username: entry.username,
            name: entry.name,
            email: entry.email,
            password: entry.password,
            role: 'member',
            disabled: false,
            createdAt: now(),
          });
          next.invites = next.invites.filter((invite) => invite.username !== entry.username);
        }
        next.registrations.splice(index, 1);
      });
    },
    list(owner) {
      if (owner?.role !== 'owner') throw fail('Ehhez tulajdonosi hozzáférés szükséges.', 403);
      return {
        users: state.users.map((u) => ({ ...publicUser(u), name: u.name, email: u.email })),
        registrations: state.registrations.map(({ id, username, name, email, requestedAt }) => ({
          id,
          username,
          name,
          email,
          requestedAt,
        })),
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
