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
const AsesoresTab = ({ authFetch }) => {
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
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
              ) : sorted.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay asesores registrados todavía.</td></tr>
              ) : sorted.map(a => {
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
const PreContratosTab = ({ authFetch }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const initialForm = { nombre: '', clave: '', fechaAperturaClave: '' };
  const [form, setForm] = useState(initialForm);

  const load = () => {
    setLoading(true);
    authFetch('/api/promotoria/pre-contratos')
      .then(res => res.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
    const url = editingId ? `/api/promotoria/pre-contratos/${editingId}` : '/api/promotoria/pre-contratos';
    authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      .then(res => res.json())
      .then(data => {
        if (data.success) { setShowModal(false); load(); }
        else alert(data.error || 'Error al guardar');
      });
  };

  const handleDelete = (id) => {
    if (!window.confirm('¿Eliminar este pre-contrato?')) return;
    authFetch(`/api/promotoria/pre-contratos/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => setItems(prev => prev.filter(p => p.id !== id)));
  };

  const sorted = [...items].sort((a, b) => (a.diasRestantes ?? 999) - (b.diasRestantes ?? 999));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
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
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>No hay pre-contratos registrados todavía.</td></tr>
              ) : sorted.map(p => {
                let badge = null;
                if (p.diasRestantes !== null && p.diasRestantes !== undefined) {
                  const vencida = p.vencida;
                  const critico = !vencida && p.diasRestantes <= 5;
                  badge = (
                    <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold', background: vencida ? 'rgba(255,68,68,0.15)' : critico ? 'rgba(226,176,66,0.15)' : 'rgba(0,255,170,0.1)', color: vencida ? '#ff4444' : critico ? 'var(--accent-gold)' : 'var(--accent-mint)' }}>
                      {vencida ? 'Vencida' : `${p.diasRestantes} días restantes`}
                    </span>
                  );
                }
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: '700' }}>{p.nombre}</td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.clave || '—'}</td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{formatReadableDate(p.fechaAperturaClave)}</td>
                    <td style={{ padding: '16px 24px' }}>{badge || '—'}</td>
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
                💡 La clave vence 30 días después de esta fecha.
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ padding: '12px 24px', borderRadius: '10px', background: '#f1f5f9', color: '#0f172a', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: '600' }}>Cancelar</button>
              <button type="submit" className="btn-primary">{editingId ? 'Guardar Cambios' : 'Añadir Pre-contrato'}</button>
            </div>
          </form>
        </ModalShell>
      )}
    </div>
  );
};

// ======================================
// Tab: Cancelaciones (importadas del Excel de "Estatus de Pólizas")
// ======================================
const CancelacionesTab = ({ authFetch }) => {
  const [data, setData] = useState({ importedAt: null, sourceFile: null, rows: [] });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const load = () => {
    setLoading(true);
    authFetch('/api/promotoria/cancelaciones')
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
    authFetch('/api/promotoria/cancelaciones/import', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(d => {
        setImporting(false);
        if (d.success) { alert(`Se importaron ${d.count} filas.`); load(); }
        else alert(d.error || 'Error al importar el archivo');
      })
      .catch(() => { setImporting(false); alert('Error al importar el archivo'); });
  };

  const rows = (data.rows || [])
    .filter(r => showAll || r.estatusNuevo === 'Anulada')
    .filter(r => (r.asesor || '').toLowerCase().includes(searchTerm.toLowerCase()));

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

      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
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

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Fecha Detectado</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Asesor</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No. Póliza</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Contratante</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Estatus Anterior</th>
                <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Estatus Nuevo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Cargando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Sin registros para mostrar.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{r.fechaDetectado}</td>
                  <td style={{ padding: '16px 24px', fontSize: '0.85rem' }}>{r.asesor}</td>
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
const Promotoria = () => {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState('asesores');

  const tabs = [
    { id: 'asesores', label: 'Asesores' },
    { id: 'cancelaciones', label: 'Cancelaciones' },
    { id: 'preContratos', label: 'Pre-contratos' }
  ];

  return (
    <div className="animate-up">
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800' }}>Panel de <span className="text-gradient-gold">Promotoría</span></h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>Panorama de toda la promotoría: asesores, cancelaciones y pre-contratos.</p>
      </header>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', borderBottom: '1px solid var(--glass-border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent-gold)' : '2px solid transparent',
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

      {tab === 'asesores' && <AsesoresTab authFetch={authFetch} />}
      {tab === 'cancelaciones' && <CancelacionesTab authFetch={authFetch} />}
      {tab === 'preContratos' && <PreContratosTab authFetch={authFetch} />}
    </div>
  );
};

export default Promotoria;
