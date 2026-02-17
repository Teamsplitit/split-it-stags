import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#74b9ff', '#a29bfe', '#fd79a8', '#81ecec'];

export default function ChannelDetail() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expensePaidBy, setExpensePaidBy] = useState('');
  const [expenseSplitPayment, setExpenseSplitPayment] = useState(false);
  const [expenseContributions, setExpenseContributions] = useState([]);
  const [expenseSplitBetween, setExpenseSplitBetween] = useState([]);
  const [expenseShareAmounts, setExpenseShareAmounts] = useState({});
  const [expenseError, setExpenseError] = useState('');
  const [settleModal, setSettleModal] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settleError, setSettleError] = useState('');
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [spendingView, setSpendingView] = useState('month'); // 'all' | 'month'
  const [spendingMonth, setSpendingMonth] = useState(() => new Date().getMonth() + 1);
  const [spendingYear, setSpendingYear] = useState(() => new Date().getFullYear());
  const [editingExpense, setEditingExpense] = useState(null);
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [chRes, expRes, setRes, sumRes] = await Promise.all([
        api(`/api/channels/${channelId}`),
        api(`/api/channels/${channelId}/expenses`),
        api(`/api/channels/${channelId}/settlements`),
        api(`/api/channels/${channelId}/summary`),
      ]);
      setChannel(chRes.channel);
      setExpenses(expRes.expenses);
      setSettlements(setRes.settlements || []);
      setSummary(sumRes);
    } catch (err) {
      setChannel(null);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => { load(); }, [load]);

  async function addExpense(e) {
    e.preventDefault();
    setExpenseError('');
    const amount = parseFloat(expenseAmount);
    if (!amount || amount <= 0) {
      setExpenseError('Enter a valid amount');
      return;
    }
    const splitBetweenIds = expenseSplitBetween.length > 0 ? expenseSplitBetween : (channel?.members?.map(m => m._id) || []);
    if (splitBetweenIds.length === 0) {
      setExpenseError('Select at least one person to split between');
      return;
    }
    const selectedMembers = channel?.members?.filter(m => splitBetweenIds.some(id => String(id) === String(m._id))) || [];
    const n = selectedMembers.length;
    const equalShare = n > 0 ? amount / n : 0;
    const perPerson = Math.floor(equalShare * 100) / 100;
    const remainder = Math.round((amount - perPerson * n) * 100) / 100;
    const getShare = (i) => (i === 0 ? perPerson + remainder : perPerson);
    const shares = selectedMembers.map((m, i) => {
      const custom = parseFloat(expenseShareAmounts[m._id]);
      return (Number.isFinite(custom) ? custom : getShare(i));
    });
    const shareSum = shares.reduce((s, v) => s + v, 0);
    if (Math.abs(shareSum - amount) > 0.02) {
      setExpenseError(`Shares must sum to ₹${amount.toFixed(2)} (current sum: ₹${shareSum.toFixed(2)})`);
      return;
    }
    let body = {
      amount,
      description: expenseDesc.trim(),
      spentAt: expenseDate || new Date().toISOString().slice(0, 10),
      splitType: 'custom',
      splits: selectedMembers.map((m, i) => ({ user: m._id, amount: Math.round(shares[i] * 100) / 100 })),
    };
    if (expenseSplitPayment && expenseContributions.length > 0) {
      const sum = expenseContributions.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
      if (Math.abs(sum - amount) > 0.02) {
        setExpenseError('Split payment amounts must sum to total');
        return;
      }
      body.contributions = expenseContributions.map(c => ({ user: c.user._id || c.user, amount: parseFloat(c.amount) || 0 }));
    } else {
      body.paidBy = expensePaidBy || user?._id;
    }
    try {
      if (editingExpense) {
        await api(`/api/channels/${channelId}/expenses/${editingExpense._id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setEditingExpense(null);
      } else {
        await api(`/api/channels/${channelId}/expenses`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setExpenseAmount('');
      setExpenseDesc('');
      setExpenseDate(new Date().toISOString().slice(0, 10));
      setExpensePaidBy('');
      setExpenseSplitPayment(false);
      setExpenseContributions([]);
      setExpenseSplitBetween([]);
      setExpenseShareAmounts({});
      setShowAddExpense(false);
      load();
    } catch (err) {
      setExpenseError(err.message);
    }
  }

  function addContributionRow() {
    const members = channel?.members || [];
    if (members.length === 0) return;
    setExpenseContributions(prev => [...prev, { user: members[0], amount: '' }]);
  }

  function updateContribution(index, field, value) {
    setExpenseContributions(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  }

  function removeContribution(index) {
    setExpenseContributions(prev => prev.filter((_, i) => i !== index));
  }

  function toggleSplitBetween(memberId) {
    setExpenseSplitBetween(prev => {
      if (prev.includes(memberId)) {
        const next = prev.filter(id => id !== memberId);
        return next.length > 0 ? next : prev;
      }
      return [...prev, memberId];
    });
    setExpenseShareAmounts({});
  }

  function openAddExpense() {
    setEditingExpense(null);
    setShowAddExpense(true);
    setExpenseAmount('');
    setExpenseDesc('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setExpensePaidBy('');
    setExpenseSplitPayment(false);
    setExpenseContributions([]);
    setExpenseSplitBetween(channel?.members?.map(m => m._id) || []);
    setExpenseShareAmounts({});
    setExpenseError('');
  }

  function toId(v) {
    if (v == null) return '';
    return typeof v === 'object' && v._id != null ? v._id : v;
  }

  function openEditExpense(exp) {
    const contribs = exp.contributions?.length > 0 ? exp.contributions : (exp.paidBy ? [{ user: exp.paidBy, amount: exp.amount }] : []);
    const splitPayment = contribs.length > 1;
    const d = exp.spentAt ? new Date(exp.spentAt) : (exp.createdAt ? new Date(exp.createdAt) : new Date());
    setEditingExpense(exp);
    setShowAddExpense(true);
    setExpenseAmount(String(exp.amount ?? ''));
    setExpenseDesc(exp.description ?? '');
    setExpenseDate(d.toISOString().slice(0, 10));
    setExpensePaidBy(splitPayment ? '' : toId(contribs[0]?.user));
    setExpenseSplitPayment(splitPayment);
    setExpenseContributions(splitPayment ? contribs.map(c => ({ user: c.user, amount: String(c.amount ?? '') })) : []);
    setExpenseSplitBetween(exp.splits?.map(s => toId(s.user)) ?? (channel?.members?.map(m => toId(m)) || []));
    setExpenseShareAmounts(
      (exp.splits || []).reduce((acc, s) => {
        const id = toId(s.user);
        if (id) acc[id] = String(s.amount ?? '');
        return acc;
      }, {})
    );
    setExpenseError('');
  }

  function closeExpenseForm() {
    setShowAddExpense(false);
    setEditingExpense(null);
    setExpenseError('');
    setExpenseContributions([]);
    setExpenseSplitPayment(false);
    setExpenseSplitBetween([]);
    setExpenseShareAmounts({});
  }

  function getSelectedMembers() {
    const ids = expenseSplitBetween.length > 0 ? expenseSplitBetween : (channel?.members?.map(m => m._id) || []);
    return channel?.members?.filter(m => ids.some(eid => String(eid) === String(m._id))) || [];
  }

  function getEqualShareAmounts() {
    const selected = getSelectedMembers();
    const amount = parseFloat(expenseAmount) || 0;
    const n = selected.length;
    if (n === 0 || amount <= 0) return {};
    const perPerson = Math.floor((amount / n) * 100) / 100;
    const remainder = Math.round((amount - perPerson * n) * 100) / 100;
    const out = {};
    selected.forEach((m, i) => { out[m._id] = i === 0 ? perPerson + remainder : perPerson; });
    return out;
  }

  function setShareAmount(memberId, value) {
    setExpenseShareAmounts(prev => ({ ...prev, [memberId]: value }));
  }

  function getMyContribution(expense) {
    const myId = user?._id?.toString();
    if (!myId) return 0;
    const contribs = expense.contributions?.length ? expense.contributions : (expense.paidBy ? [{ user: expense.paidBy, amount: expense.amount }] : []);
    return contribs.reduce((s, c) => {
      const id = (c.user?._id ?? c.user)?.toString();
      return id === myId ? s + (Number(c.amount) || 0) : s;
    }, 0);
  }

  const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function getSpendingOverTimeData() {
    const buckets = {};
    const add = (year, month, amount, myAmount) => {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { year, month, key, label: MONTH_LABELS[month - 1], total: 0, mySpent: 0 };
      buckets[key].total += amount;
      buckets[key].mySpent += myAmount;
    };
    expenses.forEach(e => {
      const d = (e.spentAt ? new Date(e.spentAt) : null) || (e.createdAt ? new Date(e.createdAt) : null) || new Date();
      const amount = Number(e.amount) || 0;
      const myAmount = getMyContribution(e);
      add(d.getFullYear(), d.getMonth() + 1, amount, myAmount);
    });
    let entries = Object.values(buckets).map(b => ({
      ...b,
      total: Math.round(b.total * 100) / 100,
      mySpent: Math.round(b.mySpent * 100) / 100,
      othersSpent: Math.round((b.total - b.mySpent) * 100) / 100,
    }));
    entries.sort((a, b) => (a.key < b.key ? -1 : 1));

    if (spendingView === 'all') {
      entries = entries.slice(-6);
    } else {
      const months = [];
      for (let i = -2; i <= 0; i++) {
        const d = new Date(spendingYear, spendingMonth - 1 + i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }
      const keys = new Set(months.map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`));
      entries = entries.filter(e => keys.has(e.key));
      const keyOrder = months.map(({ year, month }) => `${year}-${String(month).padStart(2, '0')}`);
      entries.sort((a, b) => keyOrder.indexOf(a.key) - keyOrder.indexOf(b.key));
      entries = keyOrder.map(k => entries.find(e => e.key === k) || {
        key: k,
        label: MONTH_LABELS[parseInt(k.slice(5), 10) - 1],
        total: 0,
        mySpent: 0,
        othersSpent: 0,
        year: parseInt(k.slice(0, 4), 10),
        month: parseInt(k.slice(5), 10),
      });
    }
    const currentKey = spendingView === 'month' ? `${spendingYear}-${String(spendingMonth).padStart(2, '0')}` : null;
    return entries.map(e => ({ ...e, isCurrent: e.key === currentKey }));
  }

  function getSpendingOverTimeSummary() {
    if (spendingView === 'all') {
      const total = summary?.totalSpent ?? 0;
      const myShare = summary?.mySpent ?? 0;
      const pct = total > 0 ? Math.round((myShare / total) * 100) : 0;
      return { total, myShare, pct };
    }
    const key = `${spendingYear}-${String(spendingMonth).padStart(2, '0')}`;
    const data = getSpendingOverTimeData().find(d => d.key === key);
    const total = data?.total ?? 0;
    const myShare = data?.mySpent ?? 0;
    const pct = total > 0 ? Math.round((myShare / total) * 100) : 0;
    return { total, myShare, pct };
  }

  function getSpendingSubtitle() {
    if (spendingView === 'all') return 'All time group spending';
    const monthName = new Date(spendingYear, spendingMonth - 1, 1).toLocaleString('en-US', { month: 'long' });
    return `${monthName} ${spendingYear} group spending`;
  }

  async function deleteExpense(expenseId) {
    if (!confirm('Remove this expense?')) return;
    try {
      await api(`/api/channels/${channelId}/expenses/${expenseId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteSettlement(settlementId) {
    if (!confirm('Remove this recorded payment? Balance will be recalculated.')) return;
    try {
      await api(`/api/channels/${channelId}/settlements/${settlementId}`, { method: 'DELETE' });
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  function openSettle(fromUser, toUser, amount) {
    setSettleModal({ fromUser, toUser, suggestedAmount: amount });
    setSettleAmount(String(amount));
    setSettleNote('');
    setSettleError('');
  }

  async function submitSettle(e) {
    e.preventDefault();
    if (settleSubmitting) return;
    setSettleError('');
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) {
      setSettleError('Enter a valid amount');
      return;
    }
    setSettleSubmitting(true);
    try {
      await api(`/api/channels/${channelId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({
          fromUser: settleModal.fromUser._id,
          toUser: settleModal.toUser._id,
          amount,
          note: settleNote.trim(),
        }),
      });
      setSettleModal(null);
      await load();
    } catch (err) {
      setSettleError(err.message);
    } finally {
      setSettleSubmitting(false);
    }
  }

  if (loading) return <div style={{ paddingTop: 48, textAlign: 'center' }}>Loading…</div>;
  if (!channel) return <div style={{ paddingTop: 48 }}>Channel not found. <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>Back</button></div>;

  const simplified = summary?.simplifiedDebts || [];
  const pieData = summary?.pieData?.filter(d => d.amount > 0) || [];

  return (
    <>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '16px 0',
        borderBottom: '1px solid var(--surface2)',
        marginBottom: 12,
      }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')} style={{ padding: '8px 12px' }}>
          ← Back
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, flex: 1 }}>{channel.name}</h1>
      </header>

      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        borderBottom: '1px solid var(--surface2)',
        paddingBottom: 0,
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: '0.9rem',
            fontWeight: 600,
            border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'overview' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            marginBottom: '-1px',
          }}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settlements')}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: '0.9rem',
            fontWeight: 600,
            border: 'none',
            borderBottom: activeTab === 'settlements' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'settlements' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            marginBottom: '-1px',
          }}
        >
          Settlements
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('spending')}
          style={{
            flex: 1,
            padding: '10px 12px',
            fontSize: '0.9rem',
            fontWeight: 600,
            border: 'none',
            borderBottom: activeTab === 'spending' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'spending' ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            marginBottom: '-1px',
          }}
        >
          Spending
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Balances & Settle up</div>
        {simplified.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>All settled. No one owes anyone.</p>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
          <ul style={{ listStyle: 'none' }}>
            {simplified.map((d, i) => {
              const toUserId = String((d.toUser?._id ?? d.toUser) ?? '');
              const fromUserId = String((d.fromUser?._id ?? d.fromUser) ?? '');
              const myId = String(user?._id ?? '');
              const someoneOwesMe = myId && toUserId === myId;
              const iOwe = myId && fromUserId === myId;
              const rowColor = someoneOwesMe ? 'var(--success)' : iOwe ? 'var(--danger)' : 'var(--text)';
              const borderColor = someoneOwesMe ? 'var(--success)' : iOwe ? 'var(--danger)' : 'var(--surface2)';
              return (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: '10px 0',
                  borderBottom: i < simplified.length - 1 ? '1px solid var(--surface2)' : 'none',
                  borderLeft: `4px solid ${borderColor}`,
                  paddingLeft: 12,
                }}
              >
                <span style={{ flex: '1 1 180px', color: rowColor }}>
                  <strong>{(d.fromUser?.name || d.fromUser?.email)}</strong> owes <strong>{(d.toUser?.name || d.toUser?.email)}</strong> ₹{d.amount.toFixed(2)}
                </span>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openSettle(d.fromUser, d.toUser, d.amount)}
                  >
                    Settle up
                  </button>
                </span>
              </li>
            );
          })}
          </ul>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={openAddExpense}>
          Add expense
        </button>
        {showAddExpense && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>{editingExpense ? 'Edit expense' : 'Add expense'}</div>
            <form onSubmit={addExpense}>
              <div className="form-group">
                <label className="label">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input"
                  placeholder="0.00"
                  value={expenseAmount}
                  onChange={e => { setExpenseAmount(e.target.value); setExpenseShareAmounts({}); }}
                />
              </div>
              <div className="form-group">
                <label className="label">Description (optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Dinner"
                  value={expenseDesc}
                  onChange={e => setExpenseDesc(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Date spent</label>
                <input
                  type="date"
                  className="input"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Who paid?</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={expenseSplitPayment}
                    onChange={e => setExpenseSplitPayment(e.target.checked)}
                  />
                  <span>Multiple people paid (split payment)</span>
                </label>
                {!expenseSplitPayment ? (
                  <select
                    className="input"
                    value={expensePaidBy || user?._id || ''}
                    onChange={e => setExpensePaidBy(e.target.value)}
                  >
                    {channel.members?.map(m => (
                      <option key={m._id} value={m._id}>{m.name || m.email}</option>
                    ))}
                  </select>
                ) : (
                  <div>
                    {expenseContributions.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <select
                          className="input"
                          style={{ flex: 1 }}
                          value={c.user?._id || c.user || ''}
                          onChange={e => {
                            const m = channel.members.find(x => x._id === e.target.value);
                            updateContribution(i, 'user', m || c.user);
                          }}
                        >
                          {channel.members?.map(m => (
                            <option key={m._id} value={m._id}>{m.name || m.email}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          style={{ width: 100 }}
                          placeholder="Amount"
                          value={c.amount}
                          onChange={e => updateContribution(i, 'amount', e.target.value)}
                        />
                        <button type="button" className="btn btn-ghost" style={{ padding: '8px 12px' }} onClick={() => removeContribution(i)}>×</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-ghost" style={{ marginTop: 4 }} onClick={addContributionRow}>
                      + Add payer
                    </button>
                    {expenseAmount && expenseContributions.length > 0 && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8 }}>
                        Sum: ₹{expenseContributions.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0).toFixed(2)} (total ₹{expenseAmount})
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">Split between (who shares this expense?)</label>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Only selected people will share this expense. Uncheck anyone who didn&apos;t participate.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {channel.members?.map(m => {
                    const id = m._id;
                    const checked = expenseSplitBetween.length === 0 || expenseSplitBetween.some(eid => String(eid) === String(id));
                    return (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSplitBetween(id)}
                        />
                        <span>{m.name || m.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {getSelectedMembers().length > 0 && (
                <div className="form-group">
                  <label className="label">Share per person (₹)</label>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Default is equal split. Edit to set custom shares (e.g. 2 drinks = ₹20, 1 drink = ₹10).
                  </p>
                  {getSelectedMembers().map((m, i) => {
                    const equalAmounts = getEqualShareAmounts();
                    const defaultVal = equalAmounts[m._id];
                    const displayVal = expenseShareAmounts[m._id] !== undefined && expenseShareAmounts[m._id] !== ''
                      ? expenseShareAmounts[m._id]
                      : (defaultVal != null ? defaultVal.toFixed(2) : '');
                    return (
                      <div key={m._id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ flex: '1 1 120px', fontSize: '0.9rem' }}>{m.name || m.email}</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          style={{ width: 100 }}
                          placeholder={defaultVal != null ? defaultVal.toFixed(2) : '0'}
                          value={displayVal}
                          onChange={e => setShareAmount(m._id, e.target.value)}
                        />
                      </div>
                    );
                  })}
                  {expenseAmount && getSelectedMembers().length > 0 && (() => {
                    const equalAmounts = getEqualShareAmounts();
                    const shares = getSelectedMembers().map(m => {
                      const custom = parseFloat(expenseShareAmounts[m._id]);
                      return Number.isFinite(custom) ? custom : (equalAmounts[m._id] ?? 0);
                    });
                    const sum = shares.reduce((s, v) => s + v, 0);
                    const total = parseFloat(expenseAmount) || 0;
                    const ok = Math.abs(sum - total) <= 0.02;
                    return (
                      <p style={{ fontSize: '0.85rem', marginTop: 6, color: ok ? 'var(--text-muted)' : 'var(--danger)' }}>
                        Sum: ₹{sum.toFixed(2)} {total > 0 && (ok ? `(matches total ₹${total.toFixed(2)})` : `(total ₹${total.toFixed(2)})`)}
                      </p>
                    );
                  })()}
                </div>
              )}
              {expenseError && <p className="error-msg">{expenseError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">{editingExpense ? 'Save' : 'Add'}</button>
                <button type="button" className="btn btn-ghost" onClick={closeExpenseForm}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Expenses</h2>
      {expenses.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No expenses yet.</p>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        <ul style={{ listStyle: 'none' }}>
          {expenses.map(exp => {
            const contribs = exp.contributions?.length > 0 ? exp.contributions : (exp.paidBy ? [{ user: exp.paidBy, amount: exp.amount }] : []);
            const paidByText = contribs.length > 1
              ? contribs.map(c => `${c.user?.name || c.user?.email}: ₹${(c.amount || 0).toFixed(2)}`).join(', ')
              : (contribs[0]?.user?.name || contribs[0]?.user?.email || '—');
            const splitAmong = exp.splits?.map(s => s.user?.name || s.user?.email).filter(Boolean);
            const iPaid = contribs.some(c => String(c.user?._id ?? c.user) === String(user?._id));
            const rowColor = iPaid ? 'var(--success)' : 'var(--danger)';
            const spentAt = exp.spentAt ? new Date(exp.spentAt) : (exp.createdAt ? new Date(exp.createdAt) : null);
            const dateStr = spentAt ? spentAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            return (
              <li key={exp._id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, borderLeft: `3px solid ${rowColor}` }}>
                <div style={{ flex: '1 1 200px' }}>
                  <strong style={{ color: rowColor }}>₹{exp.amount?.toFixed(2)}</strong>
                  {exp.description && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{exp.description}</span>}
                  {dateStr && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>Spent on {dateStr}</div>
                  )}
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Paid by {paidByText}
                  </div>
                  {splitAmong?.length > 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Split among {splitAmong.join(', ')}
                    </div>
                  )}
                </div>
                <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => openEditExpense(exp)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => deleteExpense(exp._id)}>
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Invite code: <strong style={{ color: 'var(--text)' }}>{channel.inviteCode}</strong></span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(channel.inviteCode);
                setInviteCodeCopied(true);
                setTimeout(() => setInviteCodeCopied(false), 2000);
              } catch (_) {}
            }}
          >
            {inviteCodeCopied ? 'Copied!' : 'Copy'}
          </button>
        </p>
        <p>Share this code so friends can join the channel.</p>
      </div>
        </>
      )}

      {activeTab === 'settlements' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Past settlements</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Payments already recorded. Remove one if it was added by mistake.
          </p>
          {settlements.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No settlements recorded yet.</p>
          ) : (
            <ul style={{ listStyle: 'none' }}>
              {settlements.map(s => (
                <li
                  key={s._id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--surface2)',
                  }}
                >
                  <span>
                    <strong>{(s.fromUser?.name || s.fromUser?.email)}</strong> paid <strong>{(s.toUser?.name || s.toUser?.email)}</strong> ₹{(s.amount || 0).toFixed(2)}
                    {s.note && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({s.note})</span>}
                  </span>
                  <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => deleteSettlement(s._id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'spending' && (
        <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div className="card-title">Who spent how much</div>
          {pieData.length > 0 ? (
            <>
              <div style={{ position: 'relative', minHeight: 240, width: '100%', isolation: 'isolate' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                    <Pie
                      data={pieData}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={72}
                      outerRadius={95}
                      paddingAngle={1}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="var(--surface)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const item = payload[0];
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              left: 'calc(50% + 110px)',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'var(--surface)',
                              border: '1px solid var(--surface2)',
                              borderRadius: 8,
                              padding: '10px 14px',
                              color: 'var(--text)',
                              zIndex: 1,
                              minWidth: 120,
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            }}
                          >
                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{item.name}</p>
                            <p style={{ margin: '4px 0 0 0', fontSize: '1rem', color: 'var(--accent)' }}>
                              ₹{Number(item.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        );
                      }}
                      wrapperStyle={{ zIndex: 1 }}
                    />
                    <Legend layout="horizontal" align="center" wrapperStyle={{ paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
                    ₹{(summary?.totalSpent ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 20 }}>
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total spent</p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    ₹{(summary?.totalSpent ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Your share</p>
                  <p style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    ₹{(summary?.mySpent ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {(summary?.totalSpent != null && summary.totalSpent > 0) && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
                      {Math.round(((summary?.mySpent ?? 0) / summary.totalSpent) * 100)}% of total group spending
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No spending yet. Add expenses to see the chart.</p>
              {(summary?.totalSpent != null || summary?.mySpent != null) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
                  {summary?.totalSpent != null && (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total spent</p>
                      <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>₹{summary.totalSpent.toFixed(2)}</p>
                    </div>
                  )}
                  {summary?.mySpent != null && (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Your share</p>
                      <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>₹{summary.mySpent.toFixed(2)}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--surface2)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>{getSpendingSubtitle()}</p>
            {expenses.length > 0 ? (
              (() => {
                const chartData = getSpendingOverTimeData();
                return (
              <>
                <div style={{ width: '100%', minHeight: 200, marginBottom: 24 }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--surface2)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                      <YAxis hide />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                          return (
                            <div
                              style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--surface2)',
                                borderRadius: 10,
                                padding: '12px 14px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                minWidth: 160,
                              }}
                            >
                              <p style={{ margin: '0 0 10px 0', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--surface2)', paddingBottom: 6 }}>
                                {label}
                              </p>
                              {payload.map((p) => (
                                <p key={p.dataKey} style={{ margin: '4px 0', fontSize: '0.9rem', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{p.name}:</span>
                                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>₹{Number(p.value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </p>
                              ))}
                              <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--surface2)', paddingTop: 6 }}>
                                <span style={{ color: 'var(--text-muted)' }}>Total:</span>
                                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="mySpent" name="Your share" stackId="stack" fill="var(--accent)" radius={[0, 0, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.isCurrent ? 'var(--accent)' : 'var(--surface2)'} />
                        ))}
                      </Bar>
                      <Bar dataKey="othersSpent" name="Others" stackId="stack" fill="var(--surface2)" radius={[0, 0, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={entry.isCurrent ? 'rgba(108, 92, 231, 0.5)' : 'var(--surface2)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {(() => {
                  const { total, myShare, pct } = getSpendingOverTimeSummary();
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
                      <div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Total spent</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                          ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>Your share</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                          ₹{myShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {total > 0 && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{pct}% of total group spending</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 12, borderTop: '1px solid var(--surface2)' }}>
                  <button
                    type="button"
                    onClick={() => setSpendingView('all')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 20,
                      border: `1px solid ${spendingView === 'all' ? 'var(--accent)' : 'var(--surface2)'}`,
                      background: spendingView === 'all' ? 'var(--accent)' : 'transparent',
                      color: spendingView === 'all' ? 'var(--bg)' : 'var(--text)',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    All time
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (spendingMonth === 1) {
                          setSpendingMonth(12);
                          setSpendingYear(y => y - 1);
                        } else {
                          setSpendingMonth(m => m - 1);
                        }
                        setSpendingView('month');
                      }}
                      style={{ padding: 8, background: 'var(--surface2)', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer' }}
                    >
                      ‹
                    </button>
                    <span style={{ minWidth: 140, textAlign: 'center', fontSize: '0.9rem' }}>
                      {new Date(spendingYear, spendingMonth - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (spendingMonth === 12) {
                          setSpendingMonth(1);
                          setSpendingYear(y => y + 1);
                        } else {
                          setSpendingMonth(m => m + 1);
                        }
                        setSpendingView('month');
                      }}
                      style={{ padding: 8, background: 'var(--surface2)', border: 'none', borderRadius: 8, color: 'var(--text)', cursor: 'pointer' }}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </>
                );
              })()
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No expenses yet. Add expenses to see the chart.</p>
            )}
          </div>
        </div>
      )}

      {settleModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => !settleSubmitting && setSettleModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 400, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="card-title">Settle up</div>
            <p style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {(settleModal.fromUser?.name || settleModal.fromUser?.email)} → {(settleModal.toUser?.name || settleModal.toUser?.email)}
            </p>
            <form onSubmit={submitSettle}>
              <div className="form-group">
                <label className="label">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input"
                  value={settleAmount}
                  onChange={e => setSettleAmount(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="label">Note (optional)</label>
                <input
                  className="input"
                  placeholder="e.g. Cash"
                  value={settleNote}
                  onChange={e => setSettleNote(e.target.value)}
                />
              </div>
              {settleError && <p className="error-msg">{settleError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={settleSubmitting}>
                  {settleSubmitting ? 'Recording…' : 'Record settlement'}
                </button>
                <button type="button" className="btn btn-ghost" disabled={settleSubmitting} onClick={() => setSettleModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
