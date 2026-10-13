import React, { useEffect, useState } from 'react';
import { useAuth } from '../App';

const STAGE_COLORS = {
  'Por contactar': '#94a3b8',
  'Llamada realizada': '#3b82f6',
  'Cita inicial agendada': '#8b5cf6',
  'Cita inicial realizada': '#a855f7',
  'Cita de cierre': '#e2b042',
  'Venta realizada': '#10b981',
  'No interesado': '#ef4444',
  'No interesado por el momento': '#f97316'
};

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

const KpiCard = ({ label, value, hint, color }) => (
  <div className="glass-card" style={{ padding: '20px', flex: '1 1 180px', minWidth: '170px' }}>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
    <p style={{ fontSize: '2rem', fontWeight: '800', color: color || 'var(--text-main)', marginTop: '6px' }}>{value}</p>
    {hint && <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '2px' }}>{hint}</p>}
  </div>
);

const ProspectStats = () => {
  const { authFetch } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState([]);
  const [merging, setMerging] = useState(false);

  const load = () => {
    authFetch('/api/prospects/stats')
      .then(res => { if (!res.ok) throw new Error('error'); return res.json(); })
      .then(setStats)
      .catch(() => setError(true));
  };

  useEffect(load, []);

  if (error) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-dim)' }}>No se pudieron cargar las estadísticas de prospección.</div>;
  if (!stats) return <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-dim)' }}>Cargando estadísticas de prospección...</div>;

  const { total, clasificados, sinClasificar, porEtapa, embudo, conversiones, seguimientos, referenciadores } = stats;
  const maxCount = Math.max(1, ...porEtapa.map(e => e.count));

  const toggle = (nombre) =>
    setSelected(prev => prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]);

  // Une los referenciadores marcados bajo el nombre del que tiene más prospectos
  const mergeSelected = () => {
    const filas = referenciadores.filter(r => selected.includes(r.nombre));
    if (filas.length < 2) return;
    const destino = [...filas].sort((a, b) => b.prospectos - a.prospectos)[0].nombre;
    const from = filas.flatMap(r => r.variantes);
    if (!window.confirm(`¿Unir ${filas.map(r => `"${r.nombre}"`).join(', ')} como "${destino}"?`)) return;
    setMerging(true);
    authFetch('/api/prospects/referrers/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: destino })
    })
      .then(res => res.json())
      .then(() => { setSelected([]); load(); })
      .catch(() => alert('No se pudieron unir los nombres'))
      .finally(() => setMerging(false));
  };

  const embudoRows = [
    { label: 'Prospectos clasificados', value: clasificados },
    { label: 'Llamadas realizadas (o más)', value: embudo.contactados },
    { label: 'Citas agendadas (o más)', value: embudo.citas },
    { label: 'Citas iniciales realizadas (o más)', value: embudo.citasRealizadas },
    { label: 'Cita de cierre (o más)', value: embudo.cierre },
    { label: 'Ventas realizadas', value: embudo.ventas }
  ];
  const maxEmbudo = Math.max(1, ...embudoRows.map(r => r.value));

  // Porcentaje sobre los referidos ya clasificados (los sin clasificar no cuentan)
  const refPct = (r, valor) => {
    const base = r.prospectos - r.sinClasificar;
    return base > 0 ? Math.round((valor / base) * 1000) / 10 : null;
  };

  return (
    <div className="animate-up" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div>
        <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: '700', color: 'var(--text-main)' }}>
          Estadísticas de <span className="text-gradient-gold">Prospección</span>
        </h1>
        <p style={{ color: 'var(--text-dim)', marginTop: '4px', fontSize: '0.95rem' }}>
          En qué etapa está cada prospecto, qué tan bien convierte tu prospección y quién te refiere más.
        </p>
      </div>

      {sinClasificar > 0 && (
        <div className="glass-card" style={{ padding: '14px 20px', borderLeft: '4px solid var(--accent-gold)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-main)' }}>{sinClasificar}</strong> de tus {total} prospectos están <strong>sin clasificar</strong> (vienen de antes de las etapas).
          No se cuentan en los porcentajes ni en las conversiones. Clasifícalos desde la pestaña Prospección (filtra por "Sin clasificar") y las estadísticas se irán completando.
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <KpiCard label="Prospectos" value={total} hint={`${clasificados} clasificados`} />
        <KpiCard label="Llamada → cita" value={fmtPct(conversiones.llamadaACita)} hint="De los contactados, cuántos llegaron a cita" color="var(--accent-gold)" />
        <KpiCard label="Cita → venta" value={fmtPct(conversiones.citaAVenta)} hint="De los que llegaron a cita, cuántos compraron" color="#10b981" />
        <KpiCard label="Llamada → venta" value={fmtPct(conversiones.llamadaAVenta)} hint="De los contactados, cuántos compraron" color="#10b981" />
        <KpiCard label="No interesados" value={fmtPct(conversiones.noInteresado)} hint="Incluye 'por el momento'" color="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <KpiCard label="Seguimientos vencidos" value={seguimientos.vencidos} color={seguimientos.vencidos ? '#ef4444' : undefined} />
        <KpiCard label="Seguimientos hoy" value={seguimientos.hoy} color={seguimientos.hoy ? 'var(--accent-gold)' : undefined} />
        <KpiCard label="Próximos 7 días" value={seguimientos.proximos7} />
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Prospectos por etapa</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {porEtapa.map(e => (
            <div key={e.etapa} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr 90px', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '600' }}>{e.etapa}</span>
              <div style={{ height: '10px', borderRadius: '6px', background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}>
                <div style={{ width: `${(e.count / maxCount) * 100}%`, height: '100%', background: STAGE_COLORS[e.etapa], transition: 'width 0.6s' }} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                <strong style={{ color: 'var(--text-main)' }}>{e.count}</strong> · {fmtPct(e.pct)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '4px' }}>Embudo comercial</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '16px' }}>
          Cuenta lo más lejos que llegó cada prospecto, aunque después haya pasado a "No interesado".
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {embudoRows.map(r => (
            <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 260px) 1fr 50px', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.label}</span>
              <div style={{ height: '10px', borderRadius: '6px', background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}>
                <div style={{ width: `${(r.value / maxEmbudo) * 100}%`, height: '100%', background: 'var(--accent-gold)', transition: 'width 0.6s' }} />
              </div>
              <strong style={{ fontSize: '0.9rem', textAlign: 'right' }}>{r.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Referenciadores</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Quién te da más prospectos y cuántos llegaron a cita y a venta. Si un nombre está escrito distinto, márcalos y únelos.
            </p>
          </div>
          <button
            onClick={mergeSelected}
            disabled={selected.length < 2 || merging}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontWeight: '600', fontSize: '0.8rem',
              cursor: selected.length < 2 ? 'not-allowed' : 'pointer',
              background: 'transparent', color: 'var(--accent-gold)', border: '1px solid var(--accent-gold)',
              opacity: selected.length < 2 ? 0.4 : 1
            }}
          >
            Unir seleccionados
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }}>
                {['', '#', 'Referenciador', 'Prospectos', 'Citas', 'Ventas', 'Cita %', 'Venta %'].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.8rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referenciadores.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  Aún no hay prospectos con "Referenciado por".
                </td></tr>
              ) : referenciadores.map((r, i) => (
                <tr key={r.nombre} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type="checkbox" checked={selected.includes(r.nombre)} onChange={() => toggle(r.nombre)} />
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontWeight: '700' }}>
                    {r.nombre}
                    {r.variantes.length > 1 && (
                      <span title={r.variantes.join(' / ')} style={{ marginLeft: '8px', fontSize: '0.7rem', color: 'var(--accent-gold)', fontWeight: '600' }}>
                        ({r.variantes.length} variantes)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: '700' }}>{r.prospectos}</td>
                  <td style={{ padding: '12px 16px' }}>{r.citas}</td>
                  <td style={{ padding: '12px 16px', color: r.ventas ? '#10b981' : undefined, fontWeight: r.ventas ? '700' : undefined }}>{r.ventas}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{fmtPct(refPct(r, r.citas))}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{fmtPct(refPct(r, r.ventas))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProspectStats;
