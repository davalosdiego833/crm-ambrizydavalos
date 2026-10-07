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
    return <div style={{ padding: '20px', color: 'red' }}>No tienes acceso a este panel.</div>;
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Cargando...</div>;
  }

  const totalMensajes = messages.total;
  const totalTokens = summary.reduce((sum, s) => sum + s.tokens, 0);
  const totalCosto = summary.reduce((sum, s) => sum + s.cost, 0);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Uso del Bot de WhatsApp</h1>

      <div style={{ marginBottom: '20px' }}>
        <label>
          Últimos
          <select value={days} onChange={(e) => { setDays(parseInt(e.target.value)); setPage(0); }} style={{ marginLeft: '5px' }}>
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
            <option value={365}>1 año</option>
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px', marginBottom: '30px' }}>
        <div style={{ padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Mensajes totales</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalMensajes}</div>
        </div>
        <div style={{ padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Tokens totales</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalTokens.toLocaleString()}</div>
        </div>
        <div style={{ padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Costo estimado</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${totalCosto.toFixed(2)}</div>
        </div>
        <div style={{ padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>Proyección mensual</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${projection?.estimatedMonthlyCost?.toFixed(2) || '0.00'}</div>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => setTab('resumen')}
          style={{ marginRight: '10px', padding: '8px 15px', background: tab === 'resumen' ? '#007bff' : '#e0e0e0', color: tab === 'resumen' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Resumen Diario
        </button>
        <button
          onClick={() => setTab('ranking')}
          style={{ marginRight: '10px', padding: '8px 15px', background: tab === 'ranking' ? '#007bff' : '#e0e0e0', color: tab === 'ranking' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Ranking de Asesores
        </button>
        <button
          onClick={() => setTab('mensajes')}
          style={{ padding: '8px 15px', background: tab === 'mensajes' ? '#007bff' : '#e0e0e0', color: tab === 'mensajes' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Detalle de Mensajes
        </button>
      </div>

      {tab === 'resumen' && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e0e0e0' }}>
          <h3>Resumen Diario</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Fecha</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Mensajes</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Tokens</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Costo</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row) => (
                <tr key={row.date} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '10px' }}>{new Date(row.date).toLocaleDateString('es-MX')}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{row.messages}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{row.tokens.toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>${row.cost.toFixed(4)}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{row.uniqueUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ranking' && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e0e0e0' }}>
          <h3>Ranking de Asesores por Costo</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Asesor</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Clave</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Mensajes</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Tokens</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '10px' }}>{row.nombre}</td>
                  <td style={{ padding: '10px' }}>{row.claveAgente || '—'}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{row.messages}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{row.tokens.toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold' }}>${row.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'mensajes' && (
        <div style={{ background: 'white', borderRadius: '8px', padding: '15px', border: '1px solid #e0e0e0' }}>
          <h3>Detalle de Mensajes</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Timestamp</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Asesor</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Tokens</th>
                <th style={{ padding: '10px', textAlign: 'right', borderBottom: '1px solid #e0e0e0' }}>Costo</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e0e0e0' }}>Herramientas</th>
              </tr>
            </thead>
            <tbody>
              {messages.messages?.map((msg) => (
                <tr key={msg.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '10px', fontSize: '12px' }}>{new Date(msg.timestamp).toLocaleString('es-MX')}</td>
                  <td style={{ padding: '10px' }}>{msg.nombre}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{msg.totalTokens}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>${msg.costoEstimado.toFixed(4)}</td>
                  <td style={{ padding: '10px', fontSize: '12px' }}>{msg.herramientas?.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              Página {page + 1} de {Math.ceil(messages.total / messages.limit)}
            </div>
            <div>
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                style={{ marginRight: '5px', padding: '8px 15px', background: page === 0 ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: page === 0 ? 'default' : 'pointer' }}
              >
                Anterior
              </button>
              <button
                disabled={page >= Math.ceil(messages.total / messages.limit) - 1}
                onClick={() => setPage(page + 1)}
                style={{ padding: '8px 15px', background: page >= Math.ceil(messages.total / messages.limit) - 1 ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
