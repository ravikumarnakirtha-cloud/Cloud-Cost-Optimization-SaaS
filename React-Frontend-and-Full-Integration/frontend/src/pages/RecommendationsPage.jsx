import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { recsApi } from '../services/api.js'
import toast from 'react-hot-toast'
import { CheckCircle, X, TrendingDown, Zap } from 'lucide-react'

export default function RecommendationsPage() {
  const qc = useQueryClient()
  const [status,   setStatus]   = useState('open')
  const [priority, setPriority] = useState('')
  const [page,     setPage]     = useState(1)

  const { data: savingsSummary } = useQuery(
    'savingsSummary', () => recsApi.savingsSummary().then(r => r.data)
  )

  const { data, isLoading, refetch } = useQuery(
    ['recs', status, priority, page],
    () => recsApi.list({
      status:   status   || undefined,
      priority: priority || undefined,
      page, size: 25
    }).then(r => r.data),
    { keepPreviousData: true }
  )

  const applyMut = useMutation(id => recsApi.apply(id), {
    onSuccess: () => { toast.success('Recommendation applied!'); qc.invalidateQueries('recs') }
  })
  const dismissMut = useMutation(id => recsApi.dismiss(id), {
    onSuccess: () => { toast.success('Dismissed'); qc.invalidateQueries('recs') }
  })

  const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low']

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Recommendations</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          AI-powered optimisation suggestions ranked by savings impact
        </p>
      </div>

      {/* Savings banner */}
      {savingsSummary && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(34,197,94,.1), rgba(6,182,212,.1))',
          border: '1px solid rgba(34,197,94,.2)',
          borderRadius: 12, padding: '1.25rem 1.5rem',
          display: 'flex', alignItems: 'center', gap: '2rem',
          marginBottom: '1.5rem', flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TrendingDown size={22} color="#22c55e" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>TOTAL POTENTIAL SAVINGS</div>
              <div className="savings-highlight" style={{ fontSize: 26, fontWeight: 800 }}>
                ${Number(savingsSummary.totalMonthlySavings).toLocaleString(undefined, { minimumFractionDigits: 2 })}/mo
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>ANNUAL IMPACT</div>
            <div className="savings-highlight" style={{ fontSize: 20, fontWeight: 800 }}>
              ${Number(savingsSummary.totalAnnualSavings).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>OPEN RECOMMENDATIONS</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              {savingsSummary.totalRecommendations}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(savingsSummary.byPriority || []).map(p => (
              <span key={p.priority} className={`badge badge-${p.priority}`}>
                {p.count} {p.priority}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['open', 'applied', 'dismissed', ''].map(s => (
            <button key={s}
              onClick={() => { setStatus(s); setPage(1) }}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1px solid ${status === s ? 'var(--accent)' : 'var(--border)'}`,
                background: status === s ? 'var(--accent-glow)' : 'transparent',
                color: status === s ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer'
              }}>
              {s || 'All'}
            </button>
          ))}
          <select className="select" value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}>
            <option value="">All Priorities</option>
            {PRIORITY_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Recommendation cards */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(data?.items || []).map(r => (
            <div key={r.id} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  background: r.category === 'delete' ? 'rgba(239,68,68,.1)' : 'var(--accent-glow)',
                  border: `1px solid ${r.category === 'delete' ? 'rgba(239,68,68,.2)' : 'rgba(6,182,212,.2)'}`,
                  borderRadius: 8, padding: 10, flexShrink: 0
                }}>
                  {r.category === 'delete' ? <Zap size={16} color="#ef4444" /> : <TrendingDown size={16} color="var(--accent)" />}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className={`badge badge-${r.priority}`}>{r.priority}</span>
                    <span className="badge badge-info">{r.category}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      effort: {r.effort}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {r.description}
                  </div>
                  <div style={{ display: 'flex', gap: '1.5rem', marginTop: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>CURRENT</div>
                      <div className="waste-highlight" style={{ fontSize: 14, fontWeight: 700 }}>
                        ${Number(r.currentCost).toFixed(2)}/mo
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>PROJECTED</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        ${Number(r.projectedCost).toFixed(2)}/mo
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>SAVINGS</div>
                      <div className="savings-highlight" style={{ fontSize: 14, fontWeight: 700 }}>
                        ${Number(r.monthlySavings).toFixed(2)}/mo
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>ANNUAL</div>
                      <div className="savings-highlight" style={{ fontSize: 14, fontWeight: 700 }}>
                        ${Number(r.annualSavings).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </div>

                {r.status === 'open' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button className="btn-primary"
                      onClick={() => applyMut.mutate(r.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12 }}>
                      <CheckCircle size={12} /> Apply
                    </button>
                    <button className="btn-danger"
                      onClick={() => dismissMut.mutate(r.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12 }}>
                      <X size={12} /> Dismiss
                    </button>
                  </div>
                )}
                {r.status !== 'open' && (
                  <span className={`badge badge-${r.status === 'applied' ? 'low' : 'medium'}`}>
                    {r.status}
                  </span>
                )}
              </div>
            </div>
          ))}
          {!data?.items?.length && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: 13 }}>
              <CheckCircle size={32} style={{ margin: '0 auto 10px', opacity: .3 }} />
              No recommendations found
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {(data?.total || 0) > 25 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1} style={{ padding: '5px 14px', fontSize: 12 }}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '5px 0' }}>
            Page {page} of {Math.ceil(data.total / 25)}
          </span>
          <button className="btn-secondary" onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / 25)} style={{ padding: '5px 14px', fontSize: 12 }}>
            Next →</button>
        </div>
      )}
    </div>
  )
}
