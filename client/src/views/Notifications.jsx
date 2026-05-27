import React, { useEffect, useState } from 'react';

const useAuth = () => {
  const token = localStorage.getItem('crm_token');
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  const authFetch = (url, options = {}) => fetch(url, {
    ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }
  });
  return { user, authFetch };
};

const Notifications = () => {
  const { user, authFetch } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatedMsg, setGeneratedMsg] = useState('');
  const [activeAlert, setActiveAlert] = useState(null);
  const [tone, setTone] = useState('formal');

  useEffect(() => {
    authFetch('http://localhost:5001/api/dashboard')
      .then(res => res.json())
      .then(data => { setAlerts(data.alerts); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

  const advisorName = user.name || 'Asesor';

  const templates = {
    formal: (a) => `Estimado(a) ${a.name}, le saluda ${advisorName}, su asesor de seguros. Le informo que su póliza de ${a.type} presenta un saldo pendiente por ${a.amount}. Quedo a sus órdenes para enviarle la liga de pago. Saludos cordiales.`,
    friendly: (a) => `¡Hola ${a.name}! 👋 Soy ${advisorName}, tu asesor de seguros. Te escribo para recordarte el pago de tu ${a.type} por ${a.amount}. ¡No queremos que pierdas tu protección! ¿Te mando el link de pago? 😊`,
    urgent: (a) => `AVISO IMPORTANTE: ${a.name}, le habla ${advisorName}. Su póliza de ${a.type} vence en ${a.days} días. Es importante realizar el pago de ${a.amount} para mantener sus beneficios activos. ¿Le comparto los datos de pago ahora?`
  };

  const generateIAMessage = (alert) => {
    setActiveAlert(alert);
    setGeneratedMsg(templates[tone](alert));
  };

  useEffect(() => {
    if (activeAlert) setGeneratedMsg(templates[tone](activeAlert));
  }, [tone]);

  return (
    <div className="animate-up">
      <h1 style={{ fontSize: '2rem', marginBottom: '32px' }}>Centro de <span className="text-gradient-gold">Notificaciones</span></h1>

      <div className="dashboard-grid">
        <div className="glass-card" style={{ gridColumn: 'span 7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h3>Cobranza del Mes</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--accent-gold)' }}>{alerts.length} pendientes</span>
          </div>

          <div style={{ maxHeight: '450px', overflowY: 'auto', paddingRight: '10px' }}>
            {loading ? <p>Cargando...</p> : alerts.length === 0 ? (
              <p style={{ color: 'var(--text-dim)' }}>Sin cobranzas pendientes. ¡Excelente!</p>
            ) : alerts.map((alert, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontWeight: 'bold' }}>{alert.name}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{alert.type} • {alert.days === 0 ? <span style={{ color: '#ff4444' }}>HOY</span> : `${alert.days} días`}</p>
                  <p style={{ fontSize: '1rem', color: 'var(--text-main)', marginTop: '4px', fontWeight: 'bold' }}>{alert.amount}</p>
                </div>
                <button onClick={() => generateIAMessage(alert)} className="btn-primary" style={{ width: 'auto', padding: '8px 16px', fontSize: '0.8rem' }}>
                  Redactar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card" style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '16px' }}>Mensaje Personalizado</h3>

          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '10px' }}>Tono del mensaje:</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['formal', 'Formal'], ['friendly', 'Amigable'], ['urgent', 'Urgente']].map(([key, label]) => (
                <button key={key} onClick={() => setTone(key)}
                  style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.7rem',
                    background: tone === key ? 'var(--accent-gold)' : 'rgba(255,255,255,0.05)',
                    color: tone === key ? 'black' : 'white', border: 'none', cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {generatedMsg ? (
            <div className="animate-up">
              <div style={{ background: 'rgba(226,176,66,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(226,176,66,0.2)', marginBottom: '20px' }}>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.6' }}>{generatedMsg}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => { navigator.clipboard.writeText(generatedMsg); alert('¡Copiado!'); }}
                  style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>
                  Copiar al Portapapeles
                </button>
                <button onClick={() => window.open(`https://wa.me/${activeAlert?.phone || ''}?text=${encodeURIComponent(generatedMsg)}`, '_blank')}
                  className="btn-primary">
                  Enviar por WhatsApp
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-dim)' }}>
              <p>Elige un cliente para que <br/> se redacte su mensaje.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
