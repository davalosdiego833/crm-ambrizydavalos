import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Hook para acceder al contexto de auth (mismo patrón que el resto de las vistas)
const useAuth = () => {
  const token = localStorage.getItem('crm_token');

  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });
  };

  return { authFetch };
};

const formatReadableDate = (dateStr) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const monthName = monthNames[parseInt(month, 10) - 1] || month;
    return `${parseInt(day, 10)} de ${monthName}, ${year}`;
  }
  return dateStr;
};

// Días que faltan para el próximo cumpleaños/aniversario a partir de una fecha
// (año se ignora, solo mes/día importan). Devuelve null si la fecha no es válida.
const daysUntilNextAnniversary = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [, month, day] = dateStr.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '10px',
  color: '#0f172a',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box'
};

const labelStyle = { fontSize: '0.8rem', color: '#334155', marginBottom: '8px', display: 'block', fontWeight: '500' };

const ModalShell = ({ title, onClose, children }) => createPortal(
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000, padding: '20px' }}>
    <div className="glass-card animate-up" style={{ width: '100%', maxWidth: '520px', padding: '36px', position: 'relative', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', boxShadow: '0 20px 40px rgba(15,23,42,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '1.2rem', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✕</button>
      <h2 className="text-gradient-gold" style={{ fontSize: '1.6rem', marginBottom: '24px' }}>{title}</h2>
      {children}
    </div>
  </div>,
  document.body
);

// ======================================
// Tab: Asesores (cumpleaños + firma de contrato)
// ======================================
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// ¿Cae en el mes actual? (año se ignora, mismo criterio que daysUntilNextAnniversary)
const isCurrentMonth = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const month = parseInt(dateStr.split('-')[1], 10);
  return month === new Date().getMonth() + 1;
};
const dayOfMonth = (dateStr) => parseInt(dateStr.split('-')[2], 10);

const ASESOR_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'cumpleMes', label: 'Cumpleaños de este mes' },
  { id: 'aniversarioMes', label: 'Aniversarios de este mes' }
];

const AsesoresTab = ({ authFetch }) => {
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState('todos');
  const initialForm = { nombre: '', claveAgente: '', fechaNacimiento: '', fechaFirmaContrato: '' };
  const [form, setForm] = useState(initialForm);

  const load = () => {
    setLoading(true);
    authFetch('/api/promotoria/asesores')
      .then(res => res.json())
      .then(data => { setAsesores(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditingId(null); setForm(initialForm); setShowModal(true); };
  const openEdit = (a) => {
    setEditingId(a.id);
    setForm({ nombre: a.nombre || '', claveAgente: a.claveAgente || '', fechaNacimiento: a.fechaNacimiento || '', fechaFirmaContrato: a.fechaFirmaContrato || '' });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/promotoria/asesores/${editingId}` : '/api/promotoria/asesores';
    authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(res => res.json())
      .then(data => {
        if (data.success) { setShowModal(false); load(); }
        else alert(data.error || 'Error al guardar');
      });
  };

  const handleDelete = (id) => {
    if (!window.confirm('¿Eliminar este asesor de la base de promotoría?')) return;
    authFetch(`/api/promotoria/asesores/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => setAsesores(prev => prev.filter(a => a.id !== id)));
  };

  const sorted = [...asesores].sort((a, b) => {
    const da = daysUntilNextAnniversary(a.fechaNacimiento);
    const db = daysUntilNextAnniversary(b.fechaNacimiento);
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  const cumpleMes = asesores
    .filter(a => isCurrentMonth(a.fechaNacimiento))
    .sort((a, b) => dayOfMonth(a.fechaNacimiento) - dayOfMonth(b.fechaNacimiento));
  const aniversarioMes = asesores
    .filter(a => isCurrentMonth(a.fechaFirmaContrato))
    .sort((a, b) => dayOfMonth(a.fechaFirmaContrato) - dayOfMonth(b.fechaFirmaContrato));

  const filtered = sorted
    .filter(a => (a.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(a => {
      if (monthFilter === 'cumpleMes') return isCurrentMonth(a.fechaNacimiento);
      if (monthFilter === 'aniversarioMes') return isCurrentMonth(a.fechaFirmaContrato);
      return true;
    });

  return (
    <div>
      {/* Alertas del mes en curso: cumpleaños y aniversarios, bien arriba */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        <div className="glass-card" style={{ padding: '20px 24px', borderLeft: '4px solid var(--accent-gold)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>🎂 Cumpleaños de {MESES[new Date().getMonth()]}</h3>
          {cumpleMes.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>Nadie cumple años este mes.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cumpleMes.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: '600' }}>{a.nombre}</span>
                  <span style={{ color: 'var(--accent-gold)', fontWeight: '700', whiteSpace: 'nowrap', marginLeft: '12px' }}>{formatReadableDate(a.fechaNacimiento)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="glass-card" style={{ padding: '20px 24px', borderLeft: '4px solid var(--accent-mint)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>🎉 Aniversarios de {MESES[new Date().getMonth()]}</h3>
          {aniversarioMes.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>Nadie cumple aniversario este mes.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {aniversarioMes.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: '600' }}>{a.nombre}</span>
                  <span style={{ color: 'var(--accent-mint)', fontWeight: '700', whiteSpace: 'nowrap', marginLeft: '12px' }}>{formatReadableDate(a.fechaFirmaContrato)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px', padding: '16px 24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por nombre..."
          style={{ padding: '10px 14px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none', minWidth: '220px' }}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ASESOR_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setMonthFilter(f.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                border: monthFilter === f.id ? '1px solid var(--accent-gold)' : '1px solid var(--glass-border)',
                background: monthFilter === f.id ? 'rgba(226,176,66,0.15)' : 'transparent',
                color: monthFilter === f.id ? 'var(--accent-gold)' : 'var(--text-muted)'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="btn-primary">+ Añadir Asesor</button>
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nombre</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Clave de Agente</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cumpleaños</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Firma de Contrato</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>{asesores.length === 0 ? 'No hay asesores registrados todavía.' : 'Ningún asesor coincide con el filtro.'}</td></tr>
              ) : filtered.map(a => {
                const dias = daysUntilNextAnniversary(a.fechaNacimiento);
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '700' }}>{a.nombre}</td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{a.claveAgente || '—'}</td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>
                      {formatReadableDate(a.fechaNacimiento)}
                      {dias !== null && (
                        <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: dias <= 7 ? 'rgba(226,176,66,0.15)' : 'rgba(255,255,255,0.05)', color: dias <= 7 ? 'var(--accent-gold)' : 'var(--text-dim)' }}>
                          {dias === 0 ? 'Hoy' : `en ${dias}d`}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatReadableDate(a.fechaFirmaContrato)}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button onClick={() => openEdit(a)} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                        <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ModalShell title={editingId ? 'Editar Asesor' : 'Añadir Asesor'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Nombre completo *</label>
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))} required />
            </div>
            <div>
              <label style={labelStyle}>Clave de Agente (opcional)</label>
              <input style={inputStyle} value={form.claveAgente} onChange={(e) => setForm(prev => ({ ...prev, claveAgente: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Cumpleaños</label>
                <input type="date" style={inputStyle} value={form.fechaNacimiento} onChange={(e) => setForm(prev => ({ ...prev, fechaNacimiento: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Firma de contrato</label>
                <input type="date" style={inputStyle} value={form.fechaFirmaContrato} onChange={(e) => setForm(prev => ({ ...prev, fechaFirmaContrato: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: '12px 24px', borderRadius: '10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
              <button type="submit" className="btn-primary">{editingId ? 'Guardar Cambios' : 'Añadir Asesor'}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
};

// ======================================
// Tab: Pre-contratos (claves con countdown de vencimiento)
// ======================================
const PreContratosTab = ({ authFetch, apiBase }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importingReasignar, setImportingReasignar] = useState(false);
  const [importingActivas, setImportingActivas] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewingEventos, setViewingEventos] = useState(null);
  const initialForm = { nombre: '', clave: '', fechaAperturaClave: '' };
  const [form, setForm] = useState(initialForm);

  const load = () => {
    setLoading(true);
    authFetch(`${apiBase}/pre-contratos`)
      .then(res => res.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleImport = (file) => {
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    authFetch(`${apiBase}/pre-contratos/import`, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(d => {
        setImporting(false);
        if (d.success) { alert(`Se importaron ${d.count} eventos. Total de pre-contratos: ${d.preContratosTotal}.`); load(); }
        else alert(d.error || 'Error al importar el archivo');
      })
      .catch(() => { setImporting(false); alert('Error al importar el archivo'); });
  };

  const handleImportReasignar = (file) => {
    if (!file) return;
    setImportingReasignar(true);
    const formData = new FormData();
    formData.append('file', file);
    authFetch(`${apiBase}/pre-contratos/polizas-reasignar/import`, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(d => {
        setImportingReasignar(false);
        if (d.success) { alert(`Se importaron ${d.count} pólizas a reasignar.`); load(); }
        else alert(d.error || 'Error al importar el archivo');
      })
      .catch(() => { setImportingReasignar(false); alert('Error al importar el archivo'); });
  };

  const handleImportActivas = (file) => {
    if (!file) return;
    setImportingActivas(true);
    const formData = new FormData();
    formData.append('file', file);
    authFetch(`${apiBase}/pre-contratos/detalle-activas/import`, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(d => {
        setImportingActivas(false);
        if (d.success) { alert(`Se importaron ${d.count} pólizas activas.`); load(); }
        else alert(d.error || 'Error al importar el archivo');
      })
      .catch(() => { setImportingActivas(false); alert('Error al importar el archivo'); });
  };

  const openAdd = () => { setEditingId(null); setForm(initialForm); setShowModal(true); };
  const openEdit = (p) => {
    setEditingId(p.id);
    setForm({ nombre: p.nombre || '', clave: p.clave || '', fechaAperturaClave: p.fechaAperturaClave || '' });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return alert('El nombre es obligatorio');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${apiBase}/pre-contratos/${editingId}` : `${apiBase}/pre-contratos`;
    authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(res => res.json())
      .then(data => {
        if (data.success) { setShowModal(false); load(); }
        else alert(data.error || 'Error al guardar');
      });
  };

  const handleDelete = (id) => {
    if (!window.confirm('¿Eliminar este pre-contrato?')) return;
    authFetch(`${apiBase}/pre-contratos/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => setItems(prev => prev.filter(p => p.id !== id)));
  };

  const sorted = [...items].sort((a, b) => {
    if (a.desaparecida !== b.desaparecida) return a.desaparecida ? -1 : 1;
    return (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: '600' }}>
          {importing ? 'Importando...' : 'Importar Excel de claves temporales'}
          <input type="file" accept=".xlsx,.xls" hidden disabled={importing} onChange={(e) => { handleImport(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: '600' }}>
          {importingReasignar ? 'Importando...' : 'Importar Excel de pólizas a reasignar'}
          <input type="file" accept=".xlsx,.xls" hidden disabled={importingReasignar} onChange={(e) => { handleImportReasignar(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--glass-border)', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: '600' }}>
          {importingActivas ? 'Importando...' : 'Importar Excel de pólizas activas'}
          <input type="file" accept=".xlsx,.xls" hidden disabled={importingActivas} onChange={(e) => { handleImportActivas(e.target.files[0]); e.target.value = ''; }} />
        </label>
        <button onClick={openAdd} className="btn-primary">+ Añadir Pre-contrato</button>
      </div>
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nombre</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Clave</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Apertura de Clave</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Vencimiento</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Pólizas</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay pre-contratos registrados todavía.</td></tr>
              ) : sorted.map(p => {
                let badge = null;
                const vencida = p.vencida;
                const critico = !vencida && p.diasRestantes <= 5;
                if (p.diasRestantes !== null && p.diasRestantes !== undefined) {
                  badge = (
                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', background: vencida ? 'rgba(255,68,68,0.15)' : critico ? 'rgba(226,176,66,0.15)' : 'rgba(0,255,170,0.1)', color: vencida ? '#ff4444' : critico ? 'var(--accent-gold)' : 'var(--accent-mint)' }}>
                      {vencida ? 'Vencida' : `${p.diasRestantes} días restantes`}
                    </span>
                  );
                }
                const eventos = p.eventos || [];
                const polizasReasignar = p.polizasReasignar || [];
                const detalleActivo = p.detalleActivo || [];
                const tieneHistorial = eventos.length > 0 || polizasReasignar.length > 0 || detalleActivo.length > 0;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: '700' }}>{p.nombre}</div>
                      {p.desaparecida && (
                        <div style={{ fontSize: '0.7rem', color: '#ff4444', marginTop: '4px', fontWeight: '600' }}>
                          Alerta: la clave desapareció del portal el {p.eventoDesaparicion?.fechaDetectado || '—'}
                          {p.eventoDesaparicion?.polizasAntes != null ? ` con ${p.eventoDesaparicion.polizasAntes} póliza(s) registradas` : ''}.
                          Confirma si firmó (elimina este registro) o gestiona la reasignación.
                          {polizasReasignar.length > 0 ? ` Detalle completo disponible (${polizasReasignar.length}).` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.clave || '—'}</td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatReadableDate(p.fechaAperturaClave)}</td>
                    <td style={{ padding: '16px 24px' }}>{badge || '—'}</td>
                    <td style={{ padding: '16px 24px' }}>
                      {!tieneHistorial ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>—</span>
                      ) : (
                        <button
                          onClick={() => setViewingEventos(p)}
                          style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', cursor: 'pointer' }}
                        >
                          {p.polizasActuales ?? 0} {p.polizasActuales === 1 ? 'póliza' : 'pólizas'} · Ver historial
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>Editar</button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', color: '#ff4444', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ModalShell title={editingId ? 'Editar Pre-contrato' : 'Añadir Pre-contrato'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={labelStyle}>Nombre completo *</label>
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))} required />
            </div>
            <div>
              <label style={labelStyle}>Clave</label>
              <input style={inputStyle} value={form.clave} onChange={(e) => setForm(prev => ({ ...prev, clave: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de apertura de la clave</label>
              <input type="date" style={inputStyle} value={form.fechaAperturaClave} onChange={(e) => setForm(prev => ({ ...prev, fechaAperturaClave: e.target.value }))} />
              <span style={{ fontSize: '0.65rem', color: 'var(--accent-gold)', marginTop: '4px', display: 'block' }}>
                💡 La clave vence 90 días después de esta fecha.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: '12px 24px', borderRadius: '10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
              <button type="submit" className="btn-primary">{editingId ? 'Guardar Cambios' : 'Añadir Pre-contrato'}</button>
            </div>
          </form>
        </ModalShell>
      )}

      {viewingEventos && (
        <ModalShell title={`Historial de clave de ${viewingEventos.nombre}`} onClose={() => setViewingEventos(null)}>
          <p style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '16px' }}>
            Clave temporal <strong>{viewingEventos.clave}</strong>. Este historial trae el conteo de pólizas de cada corrida, no el detalle línea por línea (número de póliza, contratante) mientras la clave sigue activa — ese detalle solo se conserva completo cuando la clave desaparece.
          </p>
          <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '10px 12px', color: '#334155' }}>Fecha Detectado</th>
                  <th style={{ padding: '10px 12px', color: '#334155' }}>Tipo</th>
                  <th style={{ padding: '10px 12px', color: '#334155' }}>Pólizas Antes</th>
                  <th style={{ padding: '10px 12px', color: '#334155' }}>Pólizas Ahora</th>
                </tr>
              </thead>
              <tbody>
                {[...(viewingEventos.eventos || [])].reverse().map((ev, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{ev.fechaDetectado}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', background: ev.tipo === 'DESAPARECIDA' ? 'rgba(255,68,68,0.15)' : ev.tipo === 'NUEVA' ? 'rgba(0,150,90,0.12)' : 'rgba(226,176,66,0.15)', color: ev.tipo === 'DESAPARECIDA' ? '#dc2626' : ev.tipo === 'NUEVA' ? '#059669' : '#92400e' }}>
                        {ev.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#0f172a' }}>{ev.polizasAntes ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: '600' }}>{ev.polizasAhora ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(viewingEventos.detalleActivo || []).length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#0f172a', marginBottom: '8px' }}>Pólizas actuales</h3>
              <p style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '12px' }}>
                Detalle de hoy, mientras la clave sigue activa — se actualiza completo en cada corrida.
              </p>
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>No. Póliza</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Contratante</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Producto</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingEventos.detalleActivo.map((pz, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: '600' }}>{pz.noPoliza}</td>
                        <td style={{ padding: '10px 12px', color: '#0f172a' }}>{pz.contratante}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{pz.producto}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{pz.estatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(viewingEventos.polizasReasignar || []).length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h3 style={{ fontSize: '0.95rem', color: '#0f172a', marginBottom: '8px' }}>Pólizas a reasignar</h3>
              <p style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '12px' }}>
                Detalle completo capturado cuando la clave desapareció — usa esta lista para tramitar el cambio de agente.
              </p>
              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>No. Póliza</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Contratante</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Producto</th>
                      <th style={{ padding: '10px 12px', color: '#334155' }}>Último Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewingEventos.polizasReasignar.map((pz, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px', color: '#0f172a', fontWeight: '600' }}>{pz.noPoliza}</td>
                        <td style={{ padding: '10px 12px', color: '#0f172a' }}>{pz.contratante}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{pz.producto}</td>
                        <td style={{ padding: '10px 12px', color: '#475569' }}>{pz.ultimoEstatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button type="button" onClick={() => setViewingEventos(null)} className="btn-primary">Cerrar</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

// ======================================
// Tab: Cancelaciones (importadas del Excel de "Estatus de Pólizas")
// ======================================
// Límites de fecha (YYYY-MM-DD) para los presets del filtro — semana/mes son
// desde el inicio del periodo actual (lunes / día 1) hasta hoy.
const startOfWeekStr = () => {
  const d = new Date();
  const diffToMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d.toISOString().slice(0, 10);
};
const startOfMonthStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const DATE_PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'todo', label: 'Todo el historial' },
  { id: 'personalizado', label: 'Rango personalizado' }
];

// No. de Póliza: VI = Vida, GM = GMM (Gastos Médicos Mayores)
const PRODUCTO_PRESETS = [
  { id: 'todos', label: 'Todos' },
  { id: 'VI', label: 'Vida (VI)' },
  { id: 'GM', label: 'GMM (GM)' }
];

const CancelacionesTab = ({ authFetch, apiBase }) => {
  const [data, setData] = useState({ importedAt: null, sourceFile: null, rows: [] });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('hoy');
  const [customFrom, setCustomFrom] = useState(todayStr());
  const [customTo, setCustomTo] = useState(todayStr());
  const [productoFilter, setProductoFilter] = useState('todos');

  const load = () => {
    setLoading(true);
    authFetch(`${apiBase}/cancelaciones`)
      .then(res => res.json())
      .then(d => { setData(d || { importedAt: null, sourceFile: null, rows: [] }); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleImport = (file) => {
    if (!file) return;
    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    authFetch(`${apiBase}/cancelaciones/import`, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(d => {
        setImporting(false);
        if (d.success) { alert(`Se importaron ${d.count} filas.`); load(); }
        else alert(d.error || 'Error al importar el archivo');
      })
      .catch(() => { setImporting(false); alert('Error al importar el archivo'); });
  };

  const matchesDateFilter = (fechaDetectado) => {
    if (dateFilter === 'todo') return true;
    if (!fechaDetectado) return false;
    if (dateFilter === 'hoy') return fechaDetectado === todayStr();
    if (dateFilter === 'semana') return fechaDetectado >= startOfWeekStr();
    if (dateFilter === 'mes') return fechaDetectado >= startOfMonthStr();
    if (dateFilter === 'personalizado') {
      if (customFrom && fechaDetectado < customFrom) return false;
      if (customTo && fechaDetectado > customTo) return false;
      return true;
    }
    return true;
  };

  const rows = (data.rows || [])
    .filter(r => showAll || r.estatusNuevo === 'Anulada')
    .filter(r => (r.asesor || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(r => matchesDateFilter(r.fechaDetectado))
    .filter(r => productoFilter === 'todos' || (r.noPoliza || '').toUpperCase().startsWith(productoFilter));

  return (
    <div>
      <div className="glass-card" style={{ marginBottom: '24px', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {data.importedAt
              ? <>Última importación: <strong style={{ color: 'var(--text-main)' }}>{new Date(data.importedAt).toLocaleString('es-MX')}</strong> · archivo: <strong style={{ color: 'var(--text-main)' }}>{data.sourceFile}</strong></>
              : 'Todavía no se ha importado ningún archivo.'}
          </p>
        </div>
        <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)', fontSize: '0.85rem', fontWeight: '600' }}>
          {importing ? 'Importando...' : '📊 Importar Excel'}
          <input type="file" accept=".xlsx,.xls" hidden disabled={importing} onChange={(e) => { handleImport(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>

      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {DATE_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setDateFilter(p.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                border: dateFilter === p.id ? '1px solid var(--accent-gold)' : '1px solid var(--glass-border)',
                background: dateFilter === p.id ? 'rgba(226,176,66,0.15)' : 'transparent',
                color: dateFilter === p.id ? 'var(--accent-gold)' : 'var(--text-muted)'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginRight: '4px' }}>Producto:</span>
          {PRODUCTO_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => setProductoFilter(p.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer',
                border: productoFilter === p.id ? '1px solid var(--accent-mint)' : '1px solid var(--glass-border)',
                background: productoFilter === p.id ? 'rgba(0,255,170,0.1)' : 'transparent',
                color: productoFilter === p.id ? 'var(--accent-mint)' : 'var(--text-muted)'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {dateFilter === 'personalizado' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Desde</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }} />
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hasta</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none' }} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por asesor..."
            style={{ padding: '10px 14px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none', minWidth: '220px' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Ver historial completo (no solo Anuladas)
          </label>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Total: <span style={{ color: 'var(--accent-gold)', fontWeight: 'bold' }}>{rows.length}</span>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Fecha Detectado</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Asesor</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No. Agente</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No. Póliza</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Contratante</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Estatus Anterior</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Estatus Nuevo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Sin registros para mostrar.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.fechaDetectado}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>{r.asesor}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.noAgente}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.noPoliza}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>{r.contratante}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.estatusAnterior}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', background: r.estatusNuevo === 'Anulada' ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,170,0.1)', color: r.estatusNuevo === 'Anulada' ? '#ff4444' : 'var(--accent-mint)' }}>
                      {r.estatusNuevo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ======================================
// Vista principal
// ======================================
// Organizaciones que administra este CRM, cada una con datos completamente
// separados en el servidor. Karen no tiene pestaña de Asesores: sus
// asesores se detectan automáticamente en el portal, no hay una lista
// curada con cumpleaños/firma como la de Promotoría.
const ORGS = [
  { id: 'promotoria', label: 'PROMOTORÍA AMBRIZ', apiBase: '/api/promotoria', accent: 'var(--accent-gold)', accentGlow: 'rgba(226,176,66,0.12)' },
  { id: 'karen', label: 'GERENCIA KAREN', apiBase: '/api/karen', accent: '#2563eb', accentGlow: 'rgba(37,99,235,0.10)' }
];

const Promotoria = () => {
  const { authFetch } = useAuth();
  const [org, setOrg] = useState('promotoria');
  const [tab, setTab] = useState('asesores');

  const currentOrg = ORGS.find(o => o.id === org) || ORGS[0];

  const tabs = org === 'karen'
    ? [
        { id: 'cancelaciones', label: 'Cancelaciones' },
        { id: 'preContratos', label: 'Pre-contratos' }
      ]
    : [
        { id: 'asesores', label: 'Asesores' },
        { id: 'cancelaciones', label: 'Cancelaciones' },
        { id: 'preContratos', label: 'Pre-contratos' }
      ];

  const handleOrgChange = (id) => {
    setOrg(id);
    if (id === 'karen' && tab === 'asesores') setTab('cancelaciones');
  };

  return (
    <div className="animate-up">
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800' }}>Panel de <span className="text-gradient-gold">Promotoría</span></h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Panorama de asesores, cancelaciones y pre-contratos.</p>
      </header>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
        {ORGS.map(o => (
          <button
            key={o.id}
            onClick={() => handleOrgChange(o.id)}
            style={{
              padding: '14px 28px',
              borderRadius: '12px',
              fontSize: '0.9rem',
              fontWeight: '700',
              letterSpacing: '0.4px',
              cursor: 'pointer',
              border: org === o.id ? `2px solid ${o.accent}` : '2px solid var(--glass-border)',
              background: org === o.id ? o.accentGlow : 'transparent',
              color: org === o.id ? o.accent : 'var(--text-muted)',
              transition: 'all 0.2s'
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', borderBottom: '1px solid var(--glass-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? `2px solid ${currentOrg.accent}` : '2px solid transparent',
              color: tab === t.id ? 'var(--text-main)' : 'var(--text-muted)',
              fontWeight: tab === t.id ? '700' : '500',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'asesores' && org === 'promotoria' && <AsesoresTab authFetch={authFetch} />}
      {tab === 'cancelaciones' && <CancelacionesTab key={currentOrg.id} authFetch={authFetch} apiBase={currentOrg.apiBase} />}
      {tab === 'preContratos' && <PreContratosTab key={currentOrg.id} authFetch={authFetch} apiBase={currentOrg.apiBase} />}
    </div>
  );
};

export default Promotoria;
