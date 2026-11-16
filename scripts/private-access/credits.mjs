export const unitsPerCredit = 1000;
const requestLifetime = 60 * 60 * 1000;
const integer = (value) => Number.isSafeInteger(value) && value > 0;

export function creditAccount(user) {
  return { balance: user?.credits?.balance || 0, used: user?.credits?.used || 0 };
}

export function addCredits(user, credits, receipt) {
  if (!integer(credits) || credits > 1_000_000) throw new Error('Érvénytelen kreditmennyiség.');
  user.credits ??= creditAccount(user);
  if (receipt) {
    user.credits.purchases ??= {};
    if (Object.hasOwn(user.credits.purchases, receipt)) return false;
    user.credits.purchases[receipt] = credits;
  }
  user.credits.balance += credits * unitsPerCredit;
  return true;
}

export function recordCreditUsage(user, requestId, total, now) {
  if (!integer(total) || total > 100_000_000 || !/^[a-f0-9-]{36}$/.test(requestId))
    throw new Error('Invalid credit usage.');
  user.credits ??= creditAccount(user);
  const credits = user.credits;
  credits.requests ??= {};
  for (const [id, record] of Object.entries(credits.requests)) {
    if (record.at < now - requestLifetime) delete credits.requests[id];
  }
  const saved = credits.requests[requestId]?.total ?? 0;
  if (total <= saved) return;
  const delta = total - saved;
  credits.requests[requestId] = { total, at: now };
  credits.used += delta;
  credits.balance = Math.max(0, credits.balance - delta);
}

/** Call only with a Checkout Session fetched by the server after a verified Stripe event. */
export function paidCheckoutCreditGrant(session, creditsByPrice) {
  if (
    session?.mode !== 'payment' || session.payment_status !== 'paid' ||
    !/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(session.id) ||
    !/^[a-f0-9-]{36}$/.test(session.client_reference_id) ||
    session.line_items?.has_more !== false || session.line_items.data?.length !== 1
  ) return undefined;
  const item = session.line_items.data[0];
  const credits = creditsByPrice.get(item.price?.id);
  if (item.quantity !== 1 || !integer(credits) || credits > 1_000_000) return undefined;
  return { accountId: session.client_reference_id, credits, receipt: 'stripe:' + session.id };
}
