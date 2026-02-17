import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    api('/api/channels')
      .then(({ channels }) => setChannels(channels))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

  async function createChannel(e) {
    e.preventDefault();
    setError('');
    if (!newChannelName.trim()) return;
    try {
      const { channel } = await api('/api/channels', {
        method: 'POST',
        body: JSON.stringify({ name: newChannelName.trim() }),
      });
      setChannels(prev => [channel, ...prev]);
      setNewChannelName('');
      setShowCreate(false);
      navigate(`/channel/${channel._id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function joinChannel(e) {
    e.preventDefault();
    setJoinError('');
    if (!inviteCode.trim()) return;
    try {
      const { channel } = await api('/api/channels/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      });
      setChannels(prev => [channel, ...prev.filter(c => c._id !== channel._id)]);
      setInviteCode('');
      navigate(`/channel/${channel._id}`);
    } catch (err) {
      setJoinError(err.message);
    }
  }

  return (
    <>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 0',
        borderBottom: '1px solid var(--surface2)',
        marginBottom: 20,
      }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Split It</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {user?.name || user?.email}
          </span>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <div style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setShowCreate(true)}>
          Create channel
        </button>
        {showCreate && (
          <div className="card" style={{ marginTop: 12 }}>
            <form onSubmit={createChannel}>
              <div className="form-group">
                <label className="label">Channel name</label>
                <input
                  className="input"
                  placeholder="e.g. Trip to Goa"
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <p className="error-msg">{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Create</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); setError(''); }}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Join with invite code</div>
        <form onSubmit={joinChannel} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Paste invite code"
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            style={{ flex: '1 1 160px' }}
          />
          <button type="submit" className="btn btn-ghost">Join</button>
        </form>
        {joinError && <p className="error-msg">{joinError}</p>}
      </div>

      <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Your channels</h2>
      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : channels.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No channels yet. Create one or join with an invite code.</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {channels.map(c => (
            <li key={c._id}>
              <Link
                to={`/channel/${c._id}`}
                style={{
                  display: 'block',
                  padding: 16,
                  background: 'var(--surface)',
                  borderRadius: 'var(--radius)',
                  marginBottom: 8,
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <strong>{c.name}</strong>
                <span style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {c.members?.length || 0} member(s)
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
