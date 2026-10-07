import { useState, useEffect } from 'react';

export default function BotUsage({ userRole }) {
  const [summary, setSummary] = useState([]);
  const [messages, setMessages] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [projection, setProjection] = useState(null);
  const [days, setDays] = useState(30);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, [days, page]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resResumen, resMessages, resRanking, resProjection] = await Promise.all([
        fetch(`/api/bot-usage/summary?days=${days}`).then((r) => r.json()),
        fetch(`/api/bot-usage/messages?page=${page}&limit=50&días=${days}`).then((r) => r.json()),
        fetch(`/api/bot-usage/ranking?días=${days}`).then((r) => r.json()),
        fetch('/api/bot-usage/projection').then((r) => r.json()),
      ]);
      setSummary(resResumen);
      setMessages(resMessages);
      setRanking(resRanking);
      setProjection(resProjection);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  if (userRole !== 'admin' && userRole !== 'promotoria') {
    return <div className="animate-up" style={{ padding: '20px', color: 'var(--accent-red)' }}>No tienes acceso a este panel.</div>;
  }

  if (loading) {
    return <div className="animate-up" style={{ padding: '20px', color: 'var(--text-muted)' }}>⏳ Cargando datos...</div>;
  }

  const totalMensajes = messages.total || 0;
  const totalTokens = summary.reduce((sum, s) => sum + s.tokens, 0);
  const totalCosto = summary.reduce((sum, s) => sum + s.cost, 0);

  const metricCardStyle = {
    padding: '20px',
    background: 'rgba(226, 176, 66, 0.05)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    backdropFilter: 'blur(10px)',
  };

  const metricLabelStyle = {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    fontWeight: '500',
  };

  const metricValueStyle = {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--accent-gold)',
    fontVariantNumeric: 'tabular-nums',
  };

  const selectStyle = {
    padding: '8px 12px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--glass-border)',
    borderRadius: '6px',
    color: 'var(--text-main)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    marginLeft: '8px',
  };

  const buttonStyle = (isActive) => ({
    padding: '10px 18px',
    background: isActive ? 'rgba(226, 176, 66, 0.15)' : 'transparent',
    border: 'none',
    borderBottom: isActive ? '2px solid var(--accent-gold)' : 'none',
    color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: isActive ? '600' : '400',
    transition: 'all 0.2s ease',
  });

  return (
    <div className="animate-up" style={{ padding: '0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', margin: '0 0 4px 0', color: 'var(--text-main)' }}>Uso del Bot de WhatsApp</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Tracking de mensajes y consumo de créditos</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', color: 'var(--text-main)', fontSize: '0.9rem' }}>
          Últimos
          <select
            value={days}
            onChange={(e) => { setDays(parseInt(e.target.value)); setPage(0); }}
            style={selectStyle}
          >
            <option value={7} style={{ background: 'var(--bg-surface)' }}>7 días</option>
            <option value={30} style={{ background: 'var(--bg-surface)' }}>30 días</option>
            <option value={90} style={{ background: 'var(--bg-surface)' }}>90 días</option>
            <option value={365} style={{ background: 'var(--bg-surface)' }}>1 año</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Mensajes Totales</div>
          <div style={metricValueStyle}>{totalMensajes}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Tokens Totales</div>
          <div style={metricValueStyle}>{totalTokens.toLocaleString()}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Costo Estimado</div>
          <div style={metricValueStyle}>${totalCosto.toFixed(2)}</div>
        </div>
        <div style={metricCardStyle}>
          <div style={metricLabelStyle}>Proyección Mensual</div>
          <div style={metricValueStyle}>${projection?.estimatedMonthlyCost?.toFixed(2) || '0.00'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
        <button onClick={() => setTab('resumen')} style={buttonStyle(tab === 'resumen')}>
          📊 Resumen Diario
        </button>
        <button onClick={() => setTab('ranking')} style={buttonStyle(tab === 'ranking')}>
          🏆 Ranking de Asesores
        </button>
        <button onClick={() => setTab('mensajes')} style={buttonStyle(tab === 'mensajes')}>
          📝 Detalle de Mensajes
        </button>
      </div>

      {tab === 'resumen' && (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Resumen Diario</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(226, 176, 66, 0.05)' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Fecha</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Mensajes</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Tokens</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Costo</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Usuarios</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.date} style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(226, 176, 66, 0.03)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 16px', color: 'var(--text-main)' }}>{new Date(row.date).toLocaleDateString('es-MX')}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{row.messages}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--accent-gold)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{row.tokens.toLocaleString()}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--accent-gold)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>${row.cost.toFixed(4)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-main)' }}>{row.uniqueUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'ranking' && (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>🏆 Ranking de Asesores por Costo</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(226, 176, 66, 0.05)' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Asesor</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Clave</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Mensajes</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Tokens</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(226, 176, 66, 0.03)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontWeight: '500' }}>
                      {i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}{row.nombre}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{row.claveAgente || '—'}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{row.messages}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{row.tokens.toLocaleString()}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--accent-gold)', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>${row.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'mensajes' && (
        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--glass-border)' }}>
            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>📝 Detalle de Mensajes</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(226, 176, 66, 0.05)' }}>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Timestamp</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Asesor</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Tokens</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Costo</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Herramientas</th>
                </tr>
              </thead>
              <tbody>
                {messages.messages?.map((msg) => (
                  <tr key={msg.id} style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(226, 176, 66, 0.03)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(msg.timestamp).toLocaleString('es-MX')}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontWeight: '500' }}>{msg.nombre}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{msg.totalTokens}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--accent-gold)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>${msg.costoEstimado.toFixed(4)}</td>
                    <td style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{msg.herramientas?.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Página <span style={{ color: 'var(--accent-gold)', fontWeight: '600' }}>{page + 1}</span> de <span style={{ fontWeight: '600' }}>{Math.ceil(messages.total / messages.limit)}</span> • Total: <span style={{ color: 'var(--accent-gold)', fontWeight: '600' }}>{messages.total}</span> registros
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                style={{
                  padding: '8px 16px',
                  background: page === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(226, 176, 66, 0.15)',
                  color: page === 0 ? 'var(--text-muted)' : 'var(--accent-gold)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  cursor: page === 0 ? 'default' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                }}
              >
                ← Anterior
              </button>
              <button
                disabled={page >= Math.ceil(messages.total / messages.limit) - 1}
                onClick={() => setPage(page + 1)}
                style={{
                  padding: '8px 16px',
                  background: page >= Math.ceil(messages.total / messages.limit) - 1 ? 'rgba(255,255,255,0.05)' : 'rgba(226, 176, 66, 0.15)',
                  color: page >= Math.ceil(messages.total / messages.limit) - 1 ? 'var(--text-muted)' : 'var(--accent-gold)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '6px',
                  cursor: page >= Math.ceil(messages.total / messages.limit) - 1 ? 'default' : 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                }}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
