import React, { useEffect, useState } from 'react';

const Collection = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5001/api/alerts')
      .then(res => res.json())
      .then(data => {
        setAlerts(data);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, []);

  return (
    <div className="animate-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2rem' }}>Centro de <span className="text-gradient-gold">Cobranza</span></h1>
        <div className="glass-card" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          Total Pendiente: <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>$25,500</span>
        </div>
      </div>

      <div className="dashboard-grid">
        {alerts.map((alert, i) => (
          <div key={i} className="glass-card stat-widget" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{alert.type}</span>
              <span style={{ fontSize: '0.7rem', color: alert.days <= 2 ? '#ff4444' : 'var(--accent-gold)' }}>
                Vence en {alert.days} días
              </span>
            </div>
            
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{alert.name}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Póliza: {alert.policy}</p>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-gold)' }}>{alert.amount}</p>
              <button 
                onClick={() => window.open(alert.waLink, '_blank')}
                style={{ 
                  background: 'rgba(0, 255, 170, 0.1)', 
                  color: 'var(--accent-mint)', 
                  padding: '8px 16px', 
                  borderRadius: '8px', 
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  border: '1px solid rgba(0, 255, 170, 0.2)',
                  cursor: 'pointer'
                }}
              >
                Enviar WA
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Collection;
