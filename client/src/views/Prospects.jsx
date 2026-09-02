import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Hook para acceder al contexto de auth
const useAuth = () => {
  const token = localStorage.getItem('crm_token');
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  
  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });
  };

  return { user, authFetch };
};

// Formateador de fecha legible (ej: 15 de mar, 2026)
const formatReadableDate = (dateStr) => {
  if (!dateStr) return '—';
  
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const monthNames = [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    const monthName = monthNames[monthIdx] || month;
    return `${parseInt(day, 10)} de ${monthName}, ${year}`;
  }
  
  return dateStr;
};

const Prospects = () => {
  const { authFetch } = useAuth();
  const [prospects, setProspects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Estados de Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const initialProspectData = {
    name: '',
    firstAppointmentDate: '',
    secondAppointmentDate: '',
    source: '',
    searchCommitmentDate: '',
    comments: ''
  };
  
  const [prospectData, setProspectData] = useState(initialProspectData);

  useEffect(() => {
    loadProspects();
  }, []);

  const loadProspects = () => {
    setLoading(true);
    authFetch('/api/prospects')
      .then(res => res.json())
      .then(data => {
        setProspects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando prospectos:', err);
        setLoading(false);
      });
  };

  const openAddModal = () => {
    setEditingId(null);
    setProspectData(initialProspectData);
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setProspectData({
      name: p.name || '',
      firstAppointmentDate: p.firstAppointmentDate || '',
      secondAppointmentDate: p.secondAppointmentDate || '',
      source: p.source || '',
      searchCommitmentDate: p.searchCommitmentDate || '',
      comments: p.comments || ''
    });
    setShowModal(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProspectData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleMigration = (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    authFetch('/api/migrate-prospects', {
      method: 'POST',
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error('Error en el servidor al migrar');
        return res.json();
      })
      .then(data => {
        alert(`¡Éxito! Se migraron ${data.count} prospectos a tu base de datos.`);
        loadProspects();
      })
      .catch(err => {
        console.error('Error migrando prospectos:', err);
        alert('Hubo un error al migrar el archivo Excel. Verifica el formato e inténtalo de nuevo.');
      });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prospectData.name.trim()) return alert('El nombre del prospecto es requerido');

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/prospects/${editingId}` : '/api/prospects';

    authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prospectData)
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setShowModal(false);
          setProspectData(initialProspectData);
          loadProspects();
        } else {
          alert(data.error || 'Error al guardar el prospecto');
        }
      })
      .catch(err => console.error('Error guardando prospecto:', err));
  };

  const handleDelete = (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este prospecto?')) return;

    authFetch(`/api/prospects/${id}`, {
      method: 'DELETE'
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          loadProspects();
        } else {
          alert('Error al eliminar el prospecto');
        }
      })
      .catch(err => console.error('Error eliminando prospecto:', err));
  };

  // Filtrar por búsqueda
  const filteredProspects = prospects.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.source || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.comments || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calcular alertas basadas en la fecha de compromiso de búsqueda
  const getAlerts = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(todayStr + 'T00:00:00');
    
    const todayAlerts = [];
    const in3DaysAlerts = [];

    prospects.forEach(p => {
      if (p.searchCommitmentDate) {
        const commitmentDate = new Date(p.searchCommitmentDate + 'T00:00:00');
        const diffTime = commitmentDate.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          todayAlerts.push(p);
        } else if (diffDays === 3) {
          in3DaysAlerts.push(p);
        }
      }
    });

    return { todayAlerts, in3DaysAlerts };
  };

  const { todayAlerts, in3DaysAlerts } = getAlerts();
  const hasAlerts = todayAlerts.length > 0 || in3DaysAlerts.length > 0;

  // Estilos rápidos reutilizables
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: '10px',
    color: 'var(--text-main)',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.3s'
  };

  return (
    <div className="animate-up">
      {/* Encabezado */}
      <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800' }}>Panel de <span className="text-gradient-gold">Prospección</span></h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>
            Lleva el control de tus citas, fuentes y compromisos de búsqueda de manera independiente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={openAddModal} className="btn-primary">
            + Añadir Prospecto
          </button>
        </div>
      </header>

      {/* Sección de Tarjetas de Aviso */}
      <section style={{ marginBottom: '36px' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-main)' }}>Avisos de Búsqueda</h3>
        
        {hasAlerts ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {todayAlerts.map(p => (
              <div key={`today-${p.id}`} className="glass-card animate-up" style={{ 
                borderLeft: '4px solid var(--accent-gold)', 
                background: 'rgba(226, 176, 66, 0.05)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    Compromiso para HOY: Buscar a <span style={{ color: 'var(--accent-gold)' }}>{p.name}</span>
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Fuente: {p.source || 'No especificada'} | Fecha de cita inicial: {formatReadableDate(p.firstAppointmentDate)}
                  </p>
                </div>
              </div>
            ))}

            {in3DaysAlerts.map(p => (
              <div key={`in3-${p.id}`} className="glass-card animate-up" style={{ 
                borderLeft: '4px solid #ffaa00', 
                background: 'rgba(255, 170, 0, 0.03)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    Compromiso en 3 DÍAS: Buscar a <span style={{ color: '#ffaa00' }}>{p.name}</span> ({formatReadableDate(p.searchCommitmentDate)})
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Fuente: {p.source || 'No especificada'} | Segunda cita: {formatReadableDate(p.secondAppointmentDate)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Todo al día: No tienes compromisos de búsqueda programados para hoy ni para dentro de 3 días.
          </div>
        )}
      </section>

      {/* Control y Filtro de Búsqueda */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '450px' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, fuente o comentarios..."
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              width: '100%',
              outline: 'none'
            }}
          />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
          Total: <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{filteredProspects.length}</span> prospectos
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Nombre del Prospecto</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Fuente</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Compromiso Búsqueda</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', width: '30%' }}>Comentarios/Observaciones</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    Cargando base de datos de prospectos...
                  </td>
                </tr>
              ) : filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                    No se encontraron prospectos registrados. ¡Haz clic en "Añadir Prospecto" para empezar!
                  </td>
                </tr>
              ) : (
                filteredProspects.map(p => {
                  let commitmentBadge = null;
                  if (p.searchCommitmentDate) {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const todayDate = new Date(todayStr + 'T00:00:00');
                    const cDate = new Date(p.searchCommitmentDate + 'T00:00:00');
                    const diffDays = Math.ceil((cDate - todayDate) / (1000 * 60 * 60 * 24));
                    
                    if (diffDays === 0) {
                      commitmentBadge = <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(226,176,66,0.15)', color: 'var(--accent-gold)' }}>Hoy</span>;
                    } else if (diffDays < 0) {
                      commitmentBadge = <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(255,68,68,0.15)', color: '#ff4444' }}>Atrasado</span>;
                    } else if (diffDays > 0 && diffDays <= 3) {
                      commitmentBadge = <span style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', background: 'rgba(0,255,170,0.1)', color: 'var(--accent-mint)' }}>En {diffDays}d</span>;
                    }
                  }

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--glass-border)', transition: 'background-color 0.2s' }}>
                      <td style={{ padding: '16px 24px', fontWeight: '700', color: 'var(--text-main)' }}>{p.name}</td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>
                        {p.source ? (
                          <span style={{ background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                            {p.source}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{formatReadableDate(p.searchCommitmentDate)}</span>
                          {commitmentBadge}
                        </div>
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4', whiteSpace: 'pre-line' }}>
                        {p.comments || '—'}
                      </td>
                      <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                          <button 
                            onClick={() => openEditModal(p)}
                            style={{ 
                              background: 'none', border: 'none', color: 'var(--accent-gold)', 
                              fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' 
                            }}
                          >
                            Editar
                          </button>
                          <button 
                            onClick={() => handleDelete(p.id)}
                            style={{ 
                              background: 'none', border: 'none', color: '#ff4444', 
                              fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' 
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE PROSPECTO (AÑADIR / EDITAR) */}
      {showModal && createPortal(
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', 
          display: 'flex', justifyContent: 'center', alignItems: 'center', 
          zIndex: 3000, padding: '20px' 
        }}>
          <div className="glass-card animate-up" style={{ 
            width: '100%', maxWidth: '580px', padding: '36px', 
            position: 'relative', border: '1px solid #cbd5e1', 
            background: '#ffffff', color: '#0f172a',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Botón cerrar */}
            <button 
              onClick={() => setShowModal(false)}
              style={{ 
                position: 'absolute', top: '16px', right: '16px', 
                background: '#f1f5f9', border: '1px solid #cbd5e1', 
                color: '#0f172a', fontSize: '1.2rem', cursor: 'pointer', 
                width: '36px', height: '36px', borderRadius: '50%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              ✕
            </button>

            <h2 className="text-gradient-gold" style={{ fontSize: '1.8rem', marginBottom: '24px' }}>
              {editingId ? 'Editar Prospecto' : 'Añadir Nuevo Prospecto'}
            </h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                  Nombre del prospecto *
                </label>
                <input 
                  type="text" 
                  name="name" 
                  value={prospectData.name} 
                  onChange={handleInputChange} 
                  placeholder="Nombre completo" 
                  style={inputStyle} 
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Fecha de primera cita
                  </label>
                  <input 
                    type="date" 
                    name="firstAppointmentDate" 
                    value={prospectData.firstAppointmentDate} 
                    onChange={handleInputChange} 
                    style={inputStyle} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Fecha de segunda cita
                  </label>
                  <input 
                    type="date" 
                    name="secondAppointmentDate" 
                    value={prospectData.secondAppointmentDate} 
                    onChange={handleInputChange} 
                    style={inputStyle} 
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Fuente (de dónde salió)
                  </label>
                  <input 
                    type="text" 
                    name="source" 
                    value={prospectData.source} 
                    onChange={handleInputChange} 
                    placeholder="Ej. Recomendado, Redes Sociales" 
                    style={inputStyle} 
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Compromiso de búsqueda
                  </label>
                  <input 
                    type="date" 
                    name="searchCommitmentDate" 
                    value={prospectData.searchCommitmentDate} 
                    onChange={handleInputChange} 
                    style={inputStyle} 
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent-gold)', marginTop: '4px', display: 'block' }}>
                    💡 Tip: Para saltar rápido de año, haz clic en el mes y año en la cabecera del calendario.
                  </span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                  Comentarios / Observaciones
                </label>
                <textarea 
                  name="comments" 
                  value={prospectData.comments} 
                  onChange={handleInputChange} 
                  placeholder="Detalles sobre el seguimiento..." 
                  style={{ ...inputStyle, minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }} 
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', justifyContent: 'flex-end' }}>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  style={{ 
                    padding: '12px 24px', borderRadius: '10px', 
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', 
                    border: '1px solid var(--glass-border)', cursor: 'pointer', fontWeight: '600' 
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingId ? 'Guardar Cambios' : 'Añadir Prospecto'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Prospects;
