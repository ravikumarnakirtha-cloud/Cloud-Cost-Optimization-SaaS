import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { accountsApi } from '../services/api.js'
import toast from 'react-hot-toast'
import { Cloud, Plus, Play, Trash2, CheckCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'

function ConnectModal({ onClose, onConnected }) {
  const [form, setForm] = useState({
    provider: 'aws',
    accountId: '',
    accountAlias: '',
    regions: 'us-east-1,us-west-2',
    accessKeyId: '',
    secretAccessKey: '',
    tenantIdAzure: '',
    clientId: '',
    clientSecret: ''
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...form,
        regions: form.regions.split(',').map(r => r.trim()).filter(Boolean)
      }
      await accountsApi.connect(payload)
      toast.success('Cloud account connected!')
      onConnected()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div className="card fade-in" style={{
        width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Connect Cloud Account</h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 20, lineHeight: 1
          }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Provider
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['aws', 'azure'].map(p => (
                <button key={p} type="button"
                  onClick={() => set('provider', p)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${form.provider === p ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.provider === p ? 'var(--accent-glow)' : 'var(--bg-elevated)',
                    color: form.provider === p ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase'
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              {form.provider === 'aws' ? 'AWS Account ID' : 'Subscription ID'}
            </label>
            <input className="input" value={form.accountId}
              onChange={e => set('accountId', e.target.value)} required
              placeholder={form.provider === 'aws' ? '123456789012' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Alias (optional)
            </label>
            <input className="input" value={form.accountAlias}
              onChange={e => set('accountAlias', e.target.value)}
              placeholder="e.g. my-prod-account" />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Regions (comma-separated)
            </label>
            <input className="input" value={form.regions}
              onChange={e => set('regions', e.target.value)} required
              placeholder="us-east-1,us-west-2" />
          </div>

          {form.provider === 'aws' ? (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Access Key ID
                </label>
                <input className="input" value={form.accessKeyId}
                  onChange={e => set('accessKeyId', e.target.value)}
                  placeholder="AKIA… (leave blank for simulation)" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Secret Access Key
                </label>
                <input className="input" type="password" value={form.secretAccessKey}
                  onChange={e => set('secretAccessKey', e.target.value)}
                  placeholder="••••••••• (leave blank for simulation)" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Azure Tenant ID
                </label>
                <input className="input" value={form.tenantIdAzure}
                  onChange={e => set('tenantIdAzure', e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Client ID
                </label>
                <input className="input" value={form.clientId}
                  onChange={e => set('clientId', e.target.value)} placeholder="Service principal client ID" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Client Secret
                </label>
                <input className="input" type="password" value={form.clientSecret}
                  onChange={e => set('clientSecret', e.target.value)} placeholder="••••••••• " />
              </div>
            </>
          )}

          <div style={{
            background: 'rgba(6,182,212,.05)', border: '1px solid rgba(6,182,212,.15)',
            borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)'
          }}>
            💡 Leave credentials blank to use <strong style={{ color: 'var(--accent)' }}>simulation mode</strong> —
            the system will generate realistic demo data.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 2 }}>
              {loading ? 'Connecting…' : 'Connect Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AccountsPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading } = useQuery(
    'accounts', () => accountsApi.list().then(r => r.data)
  )

  const scanMut = useMutation(
    accountId => accountsApi.triggerScan(accountId),
    { onSuccess: () => toast.success('Scan triggered!') }
  )

  const deleteMut = useMutation(
    id => accountsApi.delete(id),
    { onSuccess: () => { toast.success('Account disconnected'); qc.invalidateQueries('accounts') } }
  )

  const { data: jobs } = useQuery('scanJobs', () => accountsApi.listJobs().then(r => r.data))

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Cloud Accounts</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Manage your AWS and Azure account connections
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Connect Account
        </button>
      </div>

      {/* Accounts grid */}
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          {(data?.accounts || []).map(account => (
            <div key={account.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    background: account.provider === 'aws' ? 'rgba(245,158,11,.15)' : 'rgba(59,130,246,.15)',
                    border: `1px solid ${account.provider === 'aws' ? 'rgba(245,158,11,.3)' : 'rgba(59,130,246,.3)'}`,
                    borderRadius: 8, padding: 8
                  }}>
                    <Cloud size={16} color={account.provider === 'aws' ? '#f59e0b' : '#3b82f6'} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {account.accountAlias || account.accountId}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {account.provider}
                    </div>
                  </div>
                </div>
                <span className="badge badge-low">Active</span>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '1rem', fontFamily: 'monospace' }}>
                {account.accountId}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Regions: {(account.regions || []).join(', ')}
              </div>

              {account.lastScanAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
                  color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  <Clock size={11} />
                  Last scan: {format(new Date(account.lastScanAt), 'MMM d, HH:mm')}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary"
                  onClick={() => scanMut.mutate(account.id)}
                  disabled={scanMut.isLoading}
                  style={{ flex: 1, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 5, fontSize: 12, padding: '7px' }}>
                  <Play size={12} /> Scan Now
                </button>
                <button className="btn-danger"
                  onClick={() => { if (confirm('Disconnect this account?')) deleteMut.mutate(account.id) }}
                  style={{ padding: '7px 12px' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {!data?.accounts?.length && (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center', padding: '4rem',
              color: 'var(--text-muted)', fontSize: 13
            }}>
              <Cloud size={40} style={{ margin: '0 auto 12px', opacity: .2 }} />
              <div style={{ fontWeight: 700, marginBottom: 8 }}>No accounts connected</div>
              <div>Click "Connect Account" to get started</div>
            </div>
          )}
        </div>
      )}

      {/* Recent scan jobs */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Recent Scan Jobs</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Status</th>
              <th>Resources</th>
              <th>Zombies</th>
              <th>Triggered By</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {(jobs?.jobs || []).slice(0, 10).map(j => (
              <tr key={j.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{j.id?.slice(0, 12)}…</td>
                <td>
                  <span className={`badge badge-${j.status === 'completed' ? 'low' : j.status === 'failed' ? 'critical' : 'info'}`}>
                    {j.status}
                  </span>
                </td>
                <td style={{ fontSize: 12 }}>{j.resourcesFound ?? '—'}</td>
                <td style={{ fontSize: 12, color: '#ef4444' }}>{j.zombiesFound ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{j.triggeredBy}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {j.startedAt ? format(new Date(j.startedAt), 'MMM d HH:mm') : '—'}
                </td>
              </tr>
            ))}
            {!jobs?.jobs?.length && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem', fontSize: 13 }}>
                No scan jobs yet
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ConnectModal
          onClose={() => setShowModal(false)}
          onConnected={() => qc.invalidateQueries('accounts')}
        />
      )}
    </div>
  )
}
