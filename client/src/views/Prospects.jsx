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

// Homogeniza el formato de teléfonos para que se vean parejos en la tabla
// (algunos prospectos migrados de Excel venían como número puro "4431600083"
// y otros ya traían espacios "33 1170 6130" — eso hacía que la columna los
// envolviera distinto según el caso). No modifica el dato guardado, solo
// cómo se muestra. Si no son exactamente 10 dígitos (el formato mexicano
// estándar), se deja tal cual en vez de forzar un agrupado que podría ser
// incorrecto.
const formatPhoneDisplay = (phone) => {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return phone;
};

// Etapas comerciales (mismas que valida el servidor en server/prospectos.js)
const ETAPAS = [
  'Por contactar',
  'Llamada realizada',
  'Cita inicial agendada',
  'Cita inicial realizada',
  'Cita de cierre',
  'Venta realizada',
  'No interesado',
  'No interesado por el momento'
];
// En estas etapas ya no hay seguimiento pendiente ("por el momento" sí).
const ETAPAS_CERRADAS = ['Venta realizada', 'No interesado'];

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

// Fecha de hoy según el reloj del usuario (no UTC: de noche en México
// toISOString() ya marca el día siguiente y adelantaba los avisos).
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysUntil = (dateStr, todayStr) =>
  Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);

const FOLLOWUP_VIEWS = [
  { id: 'todos', label: 'Todos' },
  { id: 'hoy', label: 'Hoy' },
  { id: '7', label: 'Próximos 7 días' },
  { id: '10', label: 'Próximos 10 días' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'mes', label: 'Por mes' },
  { id: 'sinfecha', label: 'Sin seguimiento' }
];

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
    source: '',
    referredBy: '',
    phone: '',
    searchCommitmentDate: '',
    comments: '',
    stage: 'Por contactar'
  };
  
  const [prospectData, setProspectData] = useState(initialProspectData);

  // Filtros de seguimiento / etapa / orden
  const [followView, setFollowView] = useState('todos');
  const [monthFilter, setMonthFilter] = useState(todayLocal().slice(0, 7));
  const [stageFilter, setStageFilter] = useState('todas');
  const [sortBy, setSortBy] = useState('seguimiento');

  // Modal "Registrar contacto"
  const [contactProspect, setContactProspect] = useState(null);
  const [contactData, setContactData] = useState({ result: '', stage: '', nextDate: '' });

  useEffect(() => {
    loadProspects();
  }, []);

  // showLoader=false hace un refresco silencioso (sin reemplazar la tabla por
  // el mensaje de "Cargando...", que colapsa la altura de la página y hace
  // que se pierda la posición de scroll donde estabas trabajando).
  const loadProspects = (showLoader = true) => {
    if (showLoader) setLoading(true);
    authFetch('/api/prospects')
      .then(res => res.json())
      .then(data => {
        setProspects(Array.isArray(data) ? data : []);
        if (showLoader) setLoading(false);
      })
      .catch(err => {
        console.error('Error cargando prospectos:', err);
        if (showLoader) setLoading(false);
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
      source: p.source || '',
      referredBy: p.referredBy || '',
      phone: p.phone || '',
      searchCommitmentDate: p.searchCommitmentDate || '',
      comments: p.comments || '',
      stage: p.stage || ''
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
          // Actualiza la fila en el propio estado local (en vez de volver a
          // pedir toda la lista) para no recargar/parpadear la tabla y así no
          // perder la posición de scroll donde estabas trabajando.
          if (editingId) {
            setProspects(prev => prev.map(p => p.id === editingId ? data.prospect : p));
          } else if (data.prospect) {
            setProspects(prev => [...prev, data.prospect]);
          } else {
            loadProspects(false);
          }
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
          setProspects(prev => prev.filter(p => p.id !== id));
        } else {
          alert('Error al eliminar el prospecto');
        }
      })
      .catch(err => console.error('Error eliminando prospecto:', err));
  };

  const today = todayLocal();
  const isClosed = (p) => ETAPAS_CERRADAS.includes(p.stage);
  // Seguimiento pendiente = tiene fecha y no está cerrado (venta / no interesado)
  const hasPendingFollowUp = (p) => !!p.searchCommitmentDate && !isClosed(p);

  // Nombres de referenciadores ya usados (sugerencias para no crear variantes)
  const referrerSuggestions = Array.from(
    new Set(prospects.map(p => (p.referredBy || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const matchesFollowView = (p) => {
    if (followView === 'todos') return true;
    if (followView === 'sinfecha') return !p.searchCommitmentDate && !isClosed(p);
    if (!hasPendingFollowUp(p)) return false;
    const d = daysUntil(p.searchCommitmentDate, today);
    if (followView === 'hoy') return d === 0;
    if (followView === '7') return d >= 0 && d <= 7;
    if (followView === '10') return d >= 0 && d <= 10;
    if (followView === 'vencidos') return d < 0;
    if (followView === 'mes') return p.searchCommitmentDate.slice(0, 7) === monthFilter;
    return true;
  };

  const matchesStage = (p) => {
    if (stageFilter === 'todas') return true;
    if (stageFilter === 'sin') return !p.stage;
    return p.stage === stageFilter;
  };

  const q = searchTerm.toLowerCase();
  const filteredProspects = prospects
    .filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.source || '').toLowerCase().includes(q) ||
      (p.referredBy || '').toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.comments || '').toLowerCase().includes(q)
    )
    .filter(matchesFollowView)
    .filter(matchesStage);

  // Orden: con seguimiento pendiente por fecha más próxima (los vencidos
  // quedan arriba porque su fecha es la más antigua); después los que no
  // tienen fecha; al final los cerrados.
  const rank = (p) => (hasPendingFollowUp(p) ? 0 : isClosed(p) ? 2 : 1);
  const sortedProspects = sortBy === 'recientes'
    ? [...filteredProspects].sort((a, b) => b.id - a.id)
    : [...filteredProspects].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 0 && a.searchCommitmentDate !== b.searchCommitmentDate) {
          return a.searchCommitmentDate < b.searchCommitmentDate ? -1 : 1;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

  // Avisos de seguimiento: vencidos, hoy y próximos 3 días (solo pendientes)
  const getAlerts = () => {
    const overdueAlerts = [];
    const todayAlerts = [];
    const upcomingAlerts = [];

    prospects.filter(hasPendingFollowUp).forEach(p => {
      const diffDays = daysUntil(p.searchCommitmentDate, today);
      if (diffDays < 0) {
        overdueAlerts.push({ ...p, diffDays });
      } else if (diffDays === 0) {
        todayAlerts.push(p);
      } else if (diffDays <= 3) {
        upcomingAlerts.push({ ...p, diffDays });
      }
    });

    overdueAlerts.sort((a, b) => a.diffDays - b.diffDays);
    return { overdueAlerts, todayAlerts, upcomingAlerts };
  };

  // Cambio rápido de etapa desde la tabla
  const handleStageChange = (p, stage) => {
    if (!stage || stage === p.stage) return;
    authFetch(`/api/prospects/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) setProspects(prev => prev.map(x => x.id === p.id ? data.prospect : x));
        else alert(data.error || 'No se pudo cambiar la etapa');
      })
      .catch(err => console.error('Error cambiando etapa:', err));
  };

  const openContactModal = (p) => {
    setContactProspect(p);
    setContactData({ result: '', stage: p.stage || 'Por contactar', nextDate: '' });
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    const closing = ETAPAS_CERRADAS.includes(contactData.stage);
    if (!closing && !contactData.nextDate) {
      return alert('Programa la próxima fecha de seguimiento (o cambia la etapa a venta / no interesado).');
    }
    authFetch(`/api/prospects/${contactProspect.id}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result: contactData.result,
        stage: contactData.stage,
        nextDate: closing ? '' : contactData.nextDate
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProspects(prev => prev.map(x => x.id === contactProspect.id ? data.prospect : x));
          setContactProspect(null);
        } else {
          alert(data.error || 'No se pudo registrar el contacto');
        }
      })
      .catch(err => console.error('Error registrando contacto:', err));
  };

  const { overdueAlerts, todayAlerts, upcomingAlerts } = getAlerts();
  const hasAlerts = overdueAlerts.length > 0 || todayAlerts.length > 0 || upcomingAlerts.length > 0;

  // Estilos rápidos reutilizables — el modal de Añadir/Editar Prospecto es
  // siempre una tarjeta blanca (igual que en Clientes), sin importar el tema
  // oscuro/claro de la app, así que estos inputs usan colores fijos claros
  // en vez de las variables de tema (que en modo oscuro daban texto blanco
  // sobre fondo blanco, invisible).
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    color: '#0f172a',
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
            Lleva el control de tus prospectos: etapa comercial, seguimientos programados y quién te los refiere.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: '600', display: 'flex', alignItems: 'center' }}>
            📊 Migrar Excel
            <input type="file" accept=".xlsx,.xls" hidden onChange={(e) => { handleMigration(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <button onClick={openAddModal} className="btn-primary">
            + Añadir Prospecto
          </button>
        </div>
      </header>

      {/* Sección de Tarjetas de Aviso */}
      <section style={{ marginBottom: '36px' }}>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-main)' }}>Avisos de Seguimiento</h3>

        {hasAlerts ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              ...overdueAlerts.map(p => ({ p, kind: 'overdue', color: '#ff4444', bg: 'rgba(255, 68, 68, 0.05)',
                text: `Seguimiento ATRASADO (${Math.abs(p.diffDays)} ${Math.abs(p.diffDays) === 1 ? 'día' : 'días'}): contactar a`, showDate: true })),
              ...todayAlerts.map(p => ({ p, kind: 'today', color: 'var(--accent-gold)', bg: 'rgba(226, 176, 66, 0.05)',
                text: 'Seguimiento para HOY: contactar a', showDate: false })),
              ...upcomingAlerts.map(p => ({ p, kind: 'upcoming', color: 'var(--accent-mint)', bg: 'rgba(0, 255, 170, 0.03)',
                text: `Seguimiento en ${p.diffDays} ${p.diffDays === 1 ? 'DÍA' : 'DÍAS'}: contactar a`, showDate: true }))
            ].map(({ p, kind, color, bg, text, showDate }) => (
              <div key={`${kind}-${p.id}`} className="glass-card animate-up" style={{
                borderLeft: `4px solid ${color}`,
                background: bg,
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                    {text} <span style={{ color }}>{p.name}</span>{showDate ? ` (${formatReadableDate(p.searchCommitmentDate)})` : ''}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {p.stage || 'Sin clasificar'} | Fuente: {p.source || 'No especificada'} | Teléfono: {p.phone || 'No especificado'}
                  </p>
                </div>
                <button onClick={() => openContactModal(p)} style={{
                  background: 'none', border: `1px solid ${color}`, color, borderRadius: '8px',
                  padding: '6px 14px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer'
                }}>
                  Registrar contacto
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Todo al día: no tienes seguimientos vencidos, para hoy ni para los próximos 3 días.
          </div>
        )}
      </section>

      {/* Agenda de seguimientos: filtros */}
      <div className="glass-card" style={{ marginBottom: '16px', padding: '16px 24px' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Reservativa / Seguimientos programados
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {FOLLOWUP_VIEWS.map(v => {
            const active = followView === v.id;
            return (
              <button key={v.id} onClick={() => setFollowView(v.id)} style={{
                padding: '8px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer',
                background: active ? 'var(--accent-gold)' : 'transparent',
                color: active ? '#0f172a' : 'var(--text-muted)',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--glass-border)'}`
              }}>
                {v.label}
              </button>
            );
          })}
          {followView === 'mes' && (
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value || todayLocal().slice(0, 7))}
              style={{ padding: '7px 10px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }}
            />
          )}
        </div>
      </div>

      {/* Control y Filtro de Búsqueda */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '450px' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, fuente, referido, teléfono o comentarios..."
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }}>
            <option value="todas">Todas las etapas</option>
            {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
            <option value="sin">Sin clasificar</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }}>
            <option value="seguimiento">Orden: seguimiento más próximo</option>
            <option value="recientes">Orden: más recientes primero</option>
          </select>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
            Total: <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{filteredProspects.length}</span> prospectos
          </div>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Prospecto</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Etapa</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Fuente</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Referenciado por</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Teléfono</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem' }}>Próximo seguimiento</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', width: '25%' }}>Comentarios</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    Cargando base de datos de prospectos...
                  </td>
                </tr>
              ) : filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                    No se encontraron prospectos registrados. ¡Haz clic en "Añadir Prospecto" para empezar!
                  </td>
                </tr>
              ) : (
                sortedProspects.map(p => {
                  let commitmentBadge = null;
                  if (hasPendingFollowUp(p)) {
                    const diffDays = daysUntil(p.searchCommitmentDate, today);

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
                      <td style={{ padding: '16px 24px' }}>
                        <select
                          value={p.stage || ''}
                          onChange={(e) => handleStageChange(p, e.target.value)}
                          style={{
                            padding: '6px 8px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', outline: 'none',
                            background: '#ffffff', color: '#0f172a',
                            border: `2px solid ${STAGE_COLORS[p.stage] || '#cbd5e1'}`
                          }}
                        >
                          {!p.stage && <option value="">Sin clasificar</option>}
                          {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>
                        {p.source ? (
                          <span style={{ background: 'rgba(255,255,255,0.04)', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                            {p.source}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{p.referredBy || '—'}</td>
                      <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatPhoneDisplay(p.phone)}</td>
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
                            onClick={() => openContactModal(p)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--accent-mint)',
                              fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold'
                            }}
                          >
                            Contactar
                          </button>
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
                <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
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
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
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
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Referenciado por
                  </label>
                  <input
                    type="text"
                    name="referredBy"
                    list="referrer-suggestions"
                    value={prospectData.referredBy}
                    onChange={handleInputChange}
                    placeholder="Ej. Nombre de quien lo recomendó"
                    style={inputStyle}
                  />
                  <datalist id="referrer-suggestions">
                    {referrerSuggestions.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    name="phone"
                    value={prospectData.phone}
                    onChange={handleInputChange}
                    placeholder="Ej: 5512345678"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Próximo seguimiento
                  </label>
                  <input
                    type="date"
                    name="searchCommitmentDate"
                    value={prospectData.searchCommitmentDate}
                    onChange={handleInputChange}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent-gold)', marginTop: '4px', display: 'block' }}>
                    💡 En esa fecha te avisamos aquí mismo para contactarlo (ver "Avisos de Seguimiento" arriba).
                  </span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                  Etapa comercial
                </label>
                <select name="stage" value={prospectData.stage} onChange={handleInputChange} style={inputStyle}>
                  {!prospectData.stage && <option value="">Sin clasificar</option>}
                  {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                  Comentarios
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
                    background: '#f1f5f9', color: '#0f172a',
                    border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600'
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

      {/* MODAL REGISTRAR CONTACTO */}
      {contactProspect && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 3000, padding: '20px'
        }}>
          <div className="glass-card animate-up" style={{
            width: '100%', maxWidth: '520px', padding: '32px',
            position: 'relative', border: '1px solid #cbd5e1',
            background: '#ffffff', color: '#0f172a',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <button
              onClick={() => setContactProspect(null)}
              style={{
                position: 'absolute', top: '16px', right: '16px',
                background: '#f1f5f9', border: '1px solid #cbd5e1',
                color: '#0f172a', fontSize: '1.2rem', cursor: 'pointer',
                width: '36px', height: '36px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold'
              }}
            >
              ✕
            </button>

            <h2 className="text-gradient-gold" style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Registrar contacto</h2>
            <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '20px' }}>
              {contactProspect.name}{contactProspect.phone ? ` · ${formatPhoneDisplay(contactProspect.phone)}` : ''}
            </p>

            <form onSubmit={handleContactSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                  Resultado del contacto
                </label>
                <textarea
                  value={contactData.result}
                  onChange={(e) => setContactData(prev => ({ ...prev, result: e.target.value }))}
                  placeholder="Ej. Contestó, quedamos en llamar el jueves"
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Etapa comercial
                  </label>
                  <select
                    value={contactData.stage}
                    onChange={(e) => setContactData(prev => ({ ...prev, stage: e.target.value }))}
                    style={inputStyle}
                  >
                    {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' }}>
                    Próximo seguimiento
                  </label>
                  <input
                    type="date"
                    value={ETAPAS_CERRADAS.includes(contactData.stage) ? '' : contactData.nextDate}
                    disabled={ETAPAS_CERRADAS.includes(contactData.stage)}
                    min={today}
                    onChange={(e) => setContactData(prev => ({ ...prev, nextDate: e.target.value }))}
                    style={{ ...inputStyle, opacity: ETAPAS_CERRADAS.includes(contactData.stage) ? 0.5 : 1 }}
                  />
                </div>
              </div>
              {ETAPAS_CERRADAS.includes(contactData.stage) && (
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Con esta etapa el prospecto sale de los seguimientos pendientes.
                </span>
              )}

              {(contactProspect.contacts || []).length > 0 && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '6px' }}>Contactos anteriores</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {[...contactProspect.contacts].reverse().slice(0, 6).map((c, i) => (
                      <div key={i} style={{ fontSize: '0.78rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px' }}>
                        <strong>{formatReadableDate((c.date || '').slice(0, 10))}</strong> · {c.stage || 'Sin etapa'}
                        {c.result ? ` — ${c.result}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setContactProspect(null)}
                  style={{
                    padding: '12px 24px', borderRadius: '10px',
                    background: '#f1f5f9', color: '#0f172a',
                    border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600'
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">Guardar contacto</button>
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
