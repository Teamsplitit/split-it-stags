import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
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
    const selectedMembers = channel?.members?.filter(m => splitBetweenIds.includes(m._id)) || [];
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
      await api(`/api/channels/${channelId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setExpenseAmount('');
      setExpenseDesc('');
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
    setShowAddExpense(true);
    setExpenseSplitBetween(channel?.members?.map(m => m._id) || []);
    setExpenseShareAmounts({});
    setExpenseError('');
  }

  function getSelectedMembers() {
    const ids = expenseSplitBetween.length > 0 ? expenseSplitBetween : (channel?.members?.map(m => m._id) || []);
    return channel?.members?.filter(m => ids.includes(m._id)) || [];
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
          <ul style={{ listStyle: 'none' }}>
            {simplified.map((d, i) => (
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
                }}
              >
                <span style={{ flex: '1 1 180px' }}>
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
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={openAddExpense}>
          Add expense
        </button>
        {showAddExpense && (
          <div className="card" style={{ marginTop: 12 }}>
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
                    const checked = expenseSplitBetween.length === 0 || expenseSplitBetween.includes(id);
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
                    const shares = getSelectedMembers().map(m => parseFloat(expenseShareAmounts[m._id]) ?? equalAmounts[m._id] ?? 0);
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
                <button type="submit" className="btn btn-primary">Add</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowAddExpense(false); setExpenseError(''); setExpenseContributions([]); setExpenseSplitPayment(false); setExpenseSplitBetween([]); setExpenseShareAmounts({}); }}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Expenses</h2>
      {expenses.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No expenses yet.</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {expenses.map(exp => {
            const contribs = exp.contributions?.length > 0 ? exp.contributions : (exp.paidBy ? [{ user: exp.paidBy, amount: exp.amount }] : []);
            const paidByText = contribs.length > 1
              ? contribs.map(c => `${c.user?.name || c.user?.email}: ₹${(c.amount || 0).toFixed(2)}`).join(', ')
              : (contribs[0]?.user?.name || contribs[0]?.user?.email || '—');
            const splitAmong = exp.splits?.map(s => s.user?.name || s.user?.email).filter(Boolean);
            const canDelete = contribs.some(c => (c.user?._id || c.user) === user?._id);
            return (
              <li key={exp._id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>₹{exp.amount?.toFixed(2)}</strong>
                  {exp.description && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{exp.description}</span>}
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Paid by {paidByText}
                  </div>
                  {splitAmong?.length > 0 && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Split among {splitAmong.join(', ')}
                    </div>
                  )}
                </div>
                {canDelete && (
                  <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => deleteExpense(exp._id)}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginTop: 24, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        <p>Invite code: <strong style={{ color: 'var(--text)' }}>{channel.inviteCode}</strong></p>
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
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">Who spent how much</div>
          {pieData.length > 0 ? (
            <>
              <div style={{ height: 260, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, amount }) => `${name}: ₹${amount}`}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`₹${v}`, 'Spent']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {summary?.totalSpent != null && (
                <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Total spent: ₹{summary.totalSpent.toFixed(2)}
                </p>
              )}
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No spending yet. Add expenses to see the chart.</p>
          )}
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
