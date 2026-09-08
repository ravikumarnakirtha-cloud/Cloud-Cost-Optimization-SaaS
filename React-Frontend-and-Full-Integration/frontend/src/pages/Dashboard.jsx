import { useQuery } from 'react-query'
import { resourcesApi, recsApi } from '../services/api.js'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { DollarSign, AlertTriangle, TrendingDown, CheckCircle,
         Server, ArrowUpRight, Zap } from 'lucide-react'
import { format, subDays } from 'date-fns'

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#06b6d4', '#3b82f6', '#8b5cf6']

function StatCard({ label, value, sub, Icon, color, glow }) {
  return (
    <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80,
        background: glow || 'rgba(6,182,212,.08)',
        borderRadius: '50%', filter: 'blur(20px)'
      }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            {label}
          </p>
          <p className={color || 'cost-highlight'} style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
            {value}
          </p>
          {sub && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</p>}
        </div>
        <div style={{
          background: glow || 'var(--accent-glow)',
          border: `1px solid ${glow ? 'rgba(239,68,68,.2)' : 'rgba(6,182,212,.2)'}`,
          borderRadius: 10, padding: 10
        }}>
          <Icon size={20} color={color === 'waste-highlight' ? '#ef4444' :
            color === 'savings-highlight' ? '#22c55e' : 'var(--accent)'} />
        </div>
      </div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12
    }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: ${Number(p.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useQuery(
    'summary', () => resourcesApi.summary().then(r => r.data)
  )
  const { data: costReport } = useQuery(
    'costReport', () => resourcesApi.costReport().then(r => r.data)
  )
  const { data: history } = useQuery(
    'history', () => resourcesApi.costHistory({ days: 30 }).then(r => r.data)
  )
  const { data: savingsSummary } = useQuery(
    'savingsSummary', () => recsApi.savingsSummary().then(r => r.data)
  )
  const { data: topRecs } = useQuery(
    'topRecs', () => recsApi.list({ status: 'open', size: 5 }).then(r => r.data)
  )
  const { data: zombies } = useQuery(
    'zombies', () => resourcesApi.list({ zombie: true, size: 5 }).then(r => r.data)
  )

  if (loadingSummary) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="animate-spin" style={{
        width: 32, height: 32,
        border: '2px solid var(--accent)', borderTopColor: 'transparent',
        borderRadius: '50%'
      }} />
    </div>
  )

  const totalCost   = summary?.totalMonthlyCost  || 0
  const wastedCost  = summary?.wastedMonthlyCost || 0
  const savings     = savingsSummary?.totalMonthlySavings || 0
  const zombieCount = summary?.zombieResources   || 0

  // Build chart data from history or generate dummy 30-day trend
  const chartData = history?.history?.length
    ? history.history.map(h => ({
        date:      format(new Date(h.date), 'MMM d'),
        totalCost: +h.totalCost
      }))
    : Array.from({ length: 30 }, (_, i) => ({
        date:      format(subDays(new Date(), 29 - i), 'MMM d'),
        totalCost: +(totalCost * (0.7 + Math.random() * 0.6)).toFixed(2)
      }))

  const byTypePie = (summary?.byType || []).map((t, i) => ({
    name: t.type, value: +t.cost, fill: COLORS[i % COLORS.length]
  }))

  const byTypeBar = (costReport?.byService || []).slice(0, 6).map(s => ({
    name:    s.service.replace('_', ' ').replace('ec2', 'EC2').replace('azure', 'Azure'),
    total:   +s.totalCost,
    wasted:  +s.wastedCost
  }))

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          Cloud Cost Overview
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Real-time analysis of your cloud infrastructure spend
        </p>
      </div>

      {/* ── Stats Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          label="Total Monthly Cost"
          value={`$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`$${(totalCost * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} annually`}
          Icon={DollarSign}
          color="cost-highlight"
        />
        <StatCard
          label="Wasted Spend"
          value={`$${wastedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`${summary?.potentialSavingsPct || 0}% of total budget`}
          Icon={AlertTriangle}
          color="waste-highlight"
          glow="rgba(239,68,68,.1)"
        />
        <StatCard
          label="Zombie Resources"
          value={zombieCount}
          sub={`${summary?.totalResources || 0} total resources`}
          Icon={Server}
          color="waste-highlight"
          glow="rgba(239,68,68,.1)"
        />
        <StatCard
          label="Potential Monthly Savings"
          value={`$${savings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={`$${(savings * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} annual savings`}
          Icon={TrendingDown}
          color="savings-highlight"
          glow="rgba(34,197,94,.1)"
        />
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* Cost trend */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
            30-Day Cost Trend
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"   stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="95%"  stopColor="#06b6d4" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `$${v}`} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="totalCost" name="Total Cost"
                stroke="#06b6d4" strokeWidth={2} fill="url(#gradCost)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cost by type pie */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>
            Cost by Resource Type
          </h3>
          {byTypePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byTypePie} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={80}
                  paddingAngle={3} dataKey="value">
                  {byTypePie.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={v => `$${Number(v).toFixed(2)}`} />
                <Legend iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', fontSize: 13 }}>
              No data yet — connect a cloud account
            </div>
          )}
        </div>
      </div>

      {/* ── Cost by service bar + Recommendations ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

        {/* By service */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: '1rem' }}>
            Cost vs Waste by Service
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byTypeBar} margin={{ left: -10 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
              <Bar dataKey="total"  name="Total Cost"  fill="#06b6d4" radius={[4,4,0,0]} />
              <Bar dataKey="wasted" name="Wasted Cost" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top recommendations */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Top Recommendations</h3>
            <span style={{ fontSize: 11, color: 'var(--accent)', cursor: 'pointer' }}>
              {savingsSummary?.totalRecommendations || 0} total
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(topRecs?.items || []).map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'var(--bg-elevated)',
                borderRadius: 8, border: '1px solid var(--border)'
              }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: 200 }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span className={`badge badge-${r.priority}`}>{r.priority}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                  <div className="savings-highlight" style={{ fontSize: 13, fontWeight: 800 }}>
                    ${Number(r.monthlySavings).toFixed(0)}/mo
                  </div>
                </div>
              </div>
            ))}
            {!topRecs?.items?.length && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem 0' }}>
                <CheckCircle size={28} style={{ margin: '0 auto 8px', opacity: .4 }} />
                No open recommendations
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Zombie Resources table ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={16} color="#ef4444" />
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Zombie Resources</h3>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Latest {zombies?.items?.length || 0} • ${wastedCost.toFixed(2)} wasted/mo
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Type</th>
              <th>Region</th>
              <th>Reason</th>
              <th>Monthly Cost</th>
            </tr>
          </thead>
          <tbody>
            {(zombies?.items || []).map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{r.resourceName || r.resourceId}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {r.resourceId.slice(0, 22)}…
                  </div>
                </td>
                <td>
                  <span className="badge badge-info">{r.resourceType}</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.region || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200 }}>
                  {r.zombieReason}
                </td>
                <td className="waste-highlight" style={{ fontSize: 14, fontWeight: 800 }}>
                  ${Number(r.monthlyCost).toFixed(2)}
                </td>
              </tr>
            ))}
            {!zombies?.items?.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)',
                  padding: '2rem', fontSize: 13 }}>
                  No zombie resources detected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
