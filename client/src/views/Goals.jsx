import React, { useEffect, useState } from 'react';

const GoalProgress = ({ title, progress, color = 'var(--accent-gold)' }) => (
  <div style={{ marginBottom: '24px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
      <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{title}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{progress}%</span>
    </div>
    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ width: `${progress}%`, height: '100%', background: color, borderRadius: '10px', transition: 'width 1s ease-out' }}></div>
    </div>
  </div>
);

const Goals = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/goals')
      .then(res => res.json())
      .then(d => setData(d))
      .catch(err => console.error(err));
  }, []);

  if (!data) return <div style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '100px' }}>Calculando metas...</div>;

  return (
    <div className="animate-up">
      <h1 style={{ fontSize: '2rem', marginBottom: '32px' }}>Simulador de <span className="text-gradient-gold">Bonos y Metas</span></h1>

      <div className="dashboard-grid">
        {/* Widget de Bono Actual */}
        <div className="glass-card" style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>Bono Proyectado (Corte Actual)</p>
          <h2 style={{ fontSize: '4rem' }} className="text-gradient-gold">${data.bonus.projectedBonus.toLocaleString()}</h2>
          <div style={{ marginTop: '20px', padding: '8px 20px', borderRadius: '20px', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', fontSize: '0.9rem' }}>
            Nivel: {data.bonus.bonusRate}% sobre cobranza
          </div>
        </div>

        {/* Calculadora de Cierre */}
        <div className="glass-card" style={{ gridColumn: 'span 6' }}>
          <h3 style={{ marginBottom: '24px' }}>Calculadora de Salto de Nivel</h3>
          <div style={{ background: 'rgba(226, 176, 66, 0.05)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(226, 176, 66, 0.1)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Te faltan <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>${data.bonus.amountToNextLevel.toLocaleString()}</span></p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>para saltar al siguiente nivel de bono (15%).</p>
            <div style={{ marginTop: '20px' }}>
              <GoalProgress title="Progreso de Salto" progress={Math.round(data.bonus.progress)} />
            </div>
          </div>
          <p style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
            *Basado en persistencia actual del {(data.persistence * 100).toFixed(1)}%
          </p>
        </div>

        {/* Convenciones */}
        <div className="glass-card" style={{ gridColumn: 'span 12' }}>
          <h3 style={{ marginBottom: '32px' }}>Camino a Convenciones</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div>
              <GoalProgress title="MDRT (Million Dollar Round Table)" progress={data.mdrtProgress} color="var(--accent-mint)" />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Requerimiento: $X en primas cobradas antes de Diciembre.</p>
            </div>
            <div>
              <GoalProgress title="Convención Anual Ambriz 2024" progress={data.conventionProgress} color="var(--accent-gold)" />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Requerimiento: X pólizas pagadas y persistencia {'>'} 90%.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Goals;
