import { useQuery } from 'react-query'
import { resourcesApi } from '../services/api.js'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend
} from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, Globe } from 'lucide-react'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || 'var(--text-primary)', fontWeight: 700 }}>
          {p.name}: ${Number(p.value).toFixed(2)}
        </p>
      ))}
    </div>
  )
}

export default function CostReportPage() {
  const { data: report, isLoading } = useQuery(
    'costReport', () => resourcesApi.costReport().then(r => r.data)
  )
  const { data: history } = useQuery(
    'history30', () => resourcesApi.costHistory({ days: 30 }).then(r => r.data)
  )

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ color: 'var(--text-muted)' }}>Generating report…</div>
    </div>
  )

  const byService = (report?.byService || []).slice(0, 8).map(s => ({
    name:   s.service.replace('_', ' ').slice(0, 16),
    total:  +s.totalCost,
    wasted: +s.wastedCost,
    clean:  +(s.totalCost - s.wastedCost)
  }))

  const byRegion = (report?.byRegion || []).slice(0, 8)

  const historyData = (history?.history || []).map(h => ({
    date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: +h.totalCost
  }))

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Cost Report</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Detailed cloud cost analysis and breakdown
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Monthly',    value: `$${Number(report?.totalCost || 0).toFixed(2)}`,        color: 'cost-highlight',    Icon: DollarSign },
          { label: 'Wasted Monthly',   value: `$${Number(report?.wastedCost || 0).toFixed(2)}`,       color: 'waste-highlight',   Icon: TrendingUp  },
          { label: 'Annual Projection',value: `$${Number(report?.annualProjection || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'cost-highlight', Icon: TrendingUp },
          { label: 'Annual Savings Opp',value: `$${Number(report?.annualSavings || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'savings-highlight', Icon: TrendingDown }
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="card">
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{label}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className={color} style={{ fontSize: 22, fontWeight: 800 }}>{value}</p>
              <Icon size={18} color={
                color === 'waste-highlight' ? '#ef4444' :
                color === 'savings-highlight' ? '#22c55e' : 'var(--accent)'
              } />
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Cost by service */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Cost vs Waste by Service</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byService} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false} width={90} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="clean"  name="Utilized" fill="#06b6d4" stackId="a" radius={[0,0,0,0]} />
              <Bar dataKey="wasted" name="Wasted"   fill="#ef4444" stackId="a" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by region */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>
            <Globe size={14} style={{ display: 'inline', marginRight: 6 }} />
            Cost by Region
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byRegion.map(r => {
              const pct = report?.totalCost ? (r.cost / report.totalCost * 100) : 0
              return (
                <div key={r.region}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{r.region}</span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                      <span className="cost-highlight" style={{ fontSize: 13, fontWeight: 700 }}>
                        ${Number(r.cost).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', background: 'var(--accent)', borderRadius: 3,
                      width: `${pct}%`, transition: 'width .6s ease'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Cost trend */}
      {historyData.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>30-Day Cost History</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={historyData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `$${v}`} width={55} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="cost" name="Daily Cost"
                stroke="#06b6d4" strokeWidth={2} fill="url(#gradArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Service detail table */}
      <div className="card">
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>Service Breakdown</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Resources</th>
              <th>Total Cost</th>
              <th>Wasted Cost</th>
              <th>Waste %</th>
            </tr>
          </thead>
          <tbody>
            {(report?.byService || []).map(s => {
              const wastePct = s.totalCost > 0 ? (s.wastedCost / s.totalCost * 100) : 0
              return (
                <tr key={s.service}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>
                    {s.service.replace('_', ' ')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.resourceCount}</td>
                  <td className="cost-highlight" style={{ fontWeight: 700, fontSize: 13 }}>
                    ${Number(s.totalCost).toFixed(2)}
                  </td>
                  <td className="waste-highlight" style={{ fontWeight: 700, fontSize: 13 }}>
                    ${Number(s.wastedCost).toFixed(2)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3 }}>
                        <div style={{
                          height: '100%', borderRadius: 3,
                          background: wastePct > 50 ? '#ef4444' : wastePct > 25 ? '#f59e0b' : '#22c55e',
                          width: `${wastePct}%`
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32 }}>
                        {wastePct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
