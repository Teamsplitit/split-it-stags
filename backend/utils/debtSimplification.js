/**
 * Compute net balance per user: positive = owed to them, negative = they owe.
 * Then simplify debts so we minimize number of transactions.
 * If A owes B 10, B owes C 10, C owes A 10 -> all nets are 0, no one owes anyone.
 */

function toUserId(u) {
  if (u == null) return null;
  const id = u._id !== undefined ? u._id : u;
  return id && typeof id.toString === 'function' ? id.toString() : String(id);
}

function getNetBalances(expenses, settlements, memberIds) {
  const memberIdStrs = new Set(memberIds.map(id => toUserId(id)));
  const net = {};
  memberIdStrs.forEach(id => { net[id] = 0; });

  for (const e of expenses) {
    const contributions = e.contributions && e.contributions.length > 0
      ? e.contributions
      : (e.paidBy ? [{ user: e.paidBy, amount: e.amount }] : []);
    for (const c of contributions) {
      if (c && c.user != null && c.amount != null) {
        const uid = toUserId(c.user);
        if (memberIdStrs.has(uid)) net[uid] = (net[uid] || 0) + Number(c.amount);
      }
    }
    const splits = e.splits && e.splits.length ? e.splits : null;
    if (splits) {
      for (const s of splits) {
        if (s && s.user != null && s.amount != null) {
          const uid = toUserId(s.user);
          if (memberIdStrs.has(uid)) net[uid] = (net[uid] || 0) - Number(s.amount);
        }
      }
    } else {
      const n = memberIds.length;
      if (n > 0) {
        const perPerson = e.amount / n;
        memberIdStrs.forEach(uid => {
          net[uid] = (net[uid] || 0) - perPerson;
        });
      }
    }
  }

  for (const s of settlements) {
    if (!s || s.amount == null) continue;
    const from = toUserId(s.fromUser);
    const to = toUserId(s.toUser);
    // fromUser paid toUser: payer's debt decreases (net goes up), receiver is owed less (net goes down)
    if (memberIdStrs.has(from)) net[from] = (net[from] || 0) + Number(s.amount);
    if (memberIdStrs.has(to)) net[to] = (net[to] || 0) - Number(s.amount);
  }

  return net;
}

/**
 * Simplify debts: given net balances, return minimal list of (from, to, amount).
 * Uses greedy: largest creditor gets paid by largest debtor first.
 */
function simplifyDebts(netBalances) {
  const entries = Object.entries(netBalances)
    .filter(([, v]) => Math.abs(v) > 0.001)
    .map(([id, balance]) => ({ id, balance: Math.round(balance * 100) / 100 }));

  const debtors = entries.filter(e => e.balance < 0).sort((a, b) => a.balance - b.balance);
  const creditors = entries.filter(e => e.balance > 0).sort((a, b) => b.balance - a.balance);

  const result = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const deb = debtors[i];
    const cred = creditors[j];
    const amount = Math.min(Math.abs(deb.balance), cred.balance);
    if (amount < 0.01) {
      if (Math.abs(deb.balance) < cred.balance) i++;
      else j++;
      continue;
    }
    result.push({ fromUserId: deb.id, toUserId: cred.id, amount: Math.round(amount * 100) / 100 });
    deb.balance += amount;
    cred.balance -= amount;
    if (Math.abs(deb.balance) < 0.01) i++;
    if (cred.balance < 0.01) j++;
  }

  return result;
}

module.exports = { getNetBalances, simplifyDebts, toUserId };
