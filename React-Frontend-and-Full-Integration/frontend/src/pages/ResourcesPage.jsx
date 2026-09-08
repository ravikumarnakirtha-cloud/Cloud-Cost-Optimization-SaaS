import { useState } from 'react'
import { useQuery } from 'react-query'
import { resourcesApi } from '../services/api.js'
import { Search, Filter, RefreshCw, AlertTriangle } from 'lucide-react'

const PROVIDERS = ['', 'aws', 'azure']
const TYPES     = ['', 'ec2_instance', 'ebs_volume', 's3_bucket', 'azure_vm', 'managed_disk']

export default function ResourcesPage() {
  const [provider, setProvider] = useState('')
  const [type,     setType]     = useState('')
  const [zombie,   setZombie]   = useState('')
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)

  const { data, isLoading, refetch } = useQuery(
    ['resources', provider, type, zombie, page],
    () => resourcesApi.list({
      provider: provider || undefined,
      resourceType: type || undefined,
      zombie: zombie === '' ? undefined : zombie === 'true',
      page, size: 25
    }).then(r => r.data),
    { keepPreviousData: true }
  )

  const items = (data?.items || []).filter(r =>
    !search || (r.resourceName || r.resourceId || '').toLowerCase().includes(search.toLowerCase())
  )
  const totalPages = Math.ceil((data?.total || 0) / 25)

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Cloud Resources</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {data?.total || 0} resources across all accounts
          </p>
        </div>
        <button className="btn-secondary" onClick={() => refetch()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)'
            }} />
            <input className="input" placeholder="Search resources…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34 }} />
          </div>
          <select className="select" value={provider} onChange={e => { setProvider(e.target.value); setPage(1) }}>
            <option value="">All Providers</option>
            <option value="aws">AWS</option>
            <option value="azure">Azure</option>
          </select>
          <select className="select" value={type} onChange={e => { setType(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            {TYPES.filter(Boolean).map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <select className="select" value={zombie} onChange={e => { setZombie(e.target.value); setPage(1) }}>
            <option value="">All Resources</option>
            <option value="true">Zombies Only</option>
            <option value="false">Active Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading resources…
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Region</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Monthly Cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.isZombie && (
                        <AlertTriangle size={12} color="#ef4444" />
                      )}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {r.resourceName || r.resourceId}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {r.resourceId?.slice(0, 30)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${r.provider === 'aws' ? 'info' : 'medium'}`}>
                      {r.provider?.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.resourceType?.replace('_', ' ')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.region || '—'}</td>
                  <td>
                    {r.isZombie
                      ? <span className="zombie-pill">⚠ Zombie</span>
                      : <span className="badge badge-low" style={{ color: '#22c55e' }}>Active</span>
                    }
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={r.isZombie ? 'waste-highlight' : 'cost-highlight'}
                      style={{ fontSize: 13, fontWeight: 700 }}>
                      ${Number(r.monthlyCost).toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)',
                  padding: '3rem', fontSize: 13 }}>No resources found</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '1rem', borderTop: '1px solid var(--border)'
          }}>
            <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1} style={{ padding: '5px 14px', fontSize: 12 }}>
              ← Prev
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button className="btn-secondary" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages} style={{ padding: '5px 14px', fontSize: 12 }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
