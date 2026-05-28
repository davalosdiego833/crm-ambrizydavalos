import React, { useEffect, useState } from 'react';

// Hook para acceder al contexto de auth (importamos del mismo contexto)
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

const formatBirthday = (dateStr) => {
  if (!dateStr) return 'N/A';
  
  // Si tiene el formato MM-DD (ej: "09-15")
  if (/^\d{2}-\d{2}$/.test(dateStr)) {
    const [month, day] = dateStr.split('-');
    const monthNames = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    const monthName = monthNames[monthIdx] || month;
    return `${parseInt(day, 10)} de ${monthName}`;
  }
  
  // Si tiene el formato YYYY-MM-DD (ej: "1994-09-15")
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-');
    const monthNames = [
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    const monthName = monthNames[monthIdx] || month;
    return `${parseInt(day, 10)} de ${monthName}, ${year}`;
  }
  
  return dateStr;
};

const Clients = () => {
  const { authFetch } = useAuth();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [docCategory, setDocCategory] = useState('Poliza');
  const [sortBy, setSortBy] = useState('alphabetical-asc');

  // Estados para Modal Cliente (Crear/Editar)
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);
  
  const initialClientData = {
    contractor: '', contractorBirthDate: '', email: '', phone: '',
    policyNumber: '', product: 'Vida', planType: 'Orvi',
    emissionDate: '', collectionDate: '',
    paymentFrequency: 'MENSUAL', paymentMethod: 'TC',
    annualPremium: '', currency: 'UDI',
    insureds: [{ name: '', birthDate: '' }]
  };
  const [clientData, setClientData] = useState(initialClientData);
  const [parsingPdf, setParsingPdf] = useState(false);

  const handlePolicyParse = (file) => {
    if (!file) return;
    setParsingPdf(true);
    const formData = new FormData();
    formData.append('policy', file);

    authFetch('/api/policies/parse', {
      method: 'POST',
      body: formData
    })
    .then(res => {
      if (!res.ok) throw new Error('Error al parsear el archivo');
      return res.json();
    })
    .then(data => {
      if (data.success && data.data) {
        const info = data.data;
        
        // Mapear los datos al formulario
        setClientData(prev => {
          let updatedInsureds = prev.insureds;
          if (info.insureds && info.insureds.length > 0) {
            updatedInsureds = info.insureds.map(ins => ({
              name: ins.name || '',
              birthDate: ins.birthDate || ''
            }));
          }

          let mappedPlan = prev.planType;
          if (info.planType) {
            const planUpper = info.planType.toUpperCase();
            if (planUpper.includes('ORVI')) mappedPlan = 'Orvi';
            else if (planUpper.includes('DOTAL')) mappedPlan = 'Dotal';
            else if (planUpper.includes('MUJER')) mappedPlan = 'Vida mujer';
            else if (planUpper.includes('IMAGINA') || planUpper.includes('SER')) mappedPlan = 'Imagina ser';
            else if (planUpper.includes('PLANITUD')) mappedPlan = 'Nuevo planitud';
            else if (planUpper.includes('SEGU') || planUpper.includes('BECA')) mappedPlan = 'Segubeca';
            else if (planUpper.includes('MIO')) mappedPlan = 'Mio';
            else if (planUpper.includes('OBJETIVO')) mappedPlan = 'Objetivo Vida';
            else if (planUpper.includes('PLENO')) mappedPlan = 'Pleno';
            else if (planUpper.includes('INTEGRO')) mappedPlan = 'Integro';
            else if (planUpper.includes('PRACTICO')) mappedPlan = 'Practico';
            else if (planUpper.includes('FLEX A')) mappedPlan = 'Flex A';
            else if (planUpper.includes('FLEX B')) mappedPlan = 'Flex B';
            else {
              mappedPlan = info.product === 'GMM' ? 'Pleno' : 'Orvi';
            }
          }

          const calculatedAnnual = info.premium ? parseFloat(info.premium).toFixed(2) : prev.annualPremium;

          return {
            ...prev,
            contractor: info.contractor || prev.contractor,
            contractorBirthDate: (info.insureds && info.insureds[0]?.birthDate) || prev.contractorBirthDate,
            policyNumber: info.policyNumber || prev.policyNumber,
            product: info.product || prev.product,
            planType: mappedPlan,
            emissionDate: info.emissionDate || prev.emissionDate,
            collectionDate: info.collectionDate || prev.collectionDate,
            paymentFrequency: info.paymentFrequency || prev.paymentFrequency,
            currency: info.currency || prev.currency,
            annualPremium: calculatedAnnual,
            insureds: updatedInsureds
          };
        });
        alert('¡Carátula leída con éxito! Revisa la información autollenada en el formulario.');
      } else {
        alert('No se pudo extraer información de la carátula. Intenta subir otra carátula.');
      }
    })
    .catch(err => {
      console.error(err);
      alert('Error al leer el PDF de la carátula. Asegúrate de que sea un PDF digital legible.');
    })
    .finally(() => {
      setParsingPdf(false);
    });
  };


  // Calculo automático de prima a pagar
  const getDivisor = (freq) => {
    switch(freq) {
      case 'MENSUAL': return 12;
      case 'TRIMESTRAL': return 4;
      case 'SEMESTRAL': return 2;
      case 'ANUAL': return 1;
      default: return 1;
    }
  };
  const calculatedPremium = clientData.annualPremium ? (parseFloat(clientData.annualPremium) / getDivisor(clientData.paymentFrequency)).toFixed(2) : '0.00';

  const fetchClients = () => {
    setLoading(true);
    authFetch('/api/clients')
      .then(res => res.json())
      .then(data => {
        setClients(data);
        setLoading(false);
      });
  };

  useEffect(() => { fetchClients(); }, []);

  const handleMigration = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    authFetch('/api/migrate', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      alert(`¡Éxito! Se migraron ${data.count} clientes a tu CRM.`);
      fetchClients();
    });
  };

  const handleUpload = (clientId, file) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('category', docCategory);
    authFetch(`/api/upload/${clientId}`, {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      alert('Documento guardado');
      if (data.client) {
        setSelectedClient(data.client);
      }
      fetchClients();
    });
  };

  const handleDeleteDoc = (clientId, docIndex) => {
    if(!confirm('¿Estás seguro de eliminar este documento del expediente?')) return;
    authFetch(`/api/upload/${clientId}/${docIndex}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if (data.client) {
        setSelectedClient(data.client);
      }
      fetchClients();
    });
  };

  const handleDelete = (clientId) => {
    if(!confirm('¿Estás seguro de eliminar este cliente?')) return;
    authFetch(`/api/clients/${clientId}`, {
      method: 'DELETE'
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) fetchClients();
    });
  };

  const openNewModal = () => {
    setEditingClientId(null);
    setClientData(initialClientData);
    setShowClientModal(true);
  };

  const openEditModal = (client) => {
    setEditingClientId(client.id);
    setClientData({
      contractor: client.contractor || '',
      contractorBirthDate: client.contractorBirthDate || '',
      email: client.email || '',
      phone: client.phone || '',
      policyNumber: client.policyNumber || '',
      product: client.product || 'Vida',
      planType: client.planType || '',
      emissionDate: client.emissionDate || '',
      collectionDate: client.collectionDate || '',
      paymentFrequency: client.paymentFrequency || 'MENSUAL',
      paymentMethod: client.paymentMethod || 'TC',
      annualPremium: client.annualPremium || '',
      currency: client.currency || 'UDI',
      insureds: client.insureds && client.insureds.length > 0 ? client.insureds : [{ name: client.contractor || '', birthDate: client.contractorBirthDate || '' }]
    });
    setShowClientModal(true);
  };

  const handleSubmitClient = (e) => {
    e.preventDefault();
    const payload = {
      ...clientData,
      premium: calculatedPremium // Send calculated installment premium
    };

    const url = editingClientId ? `/api/clients/${editingClientId}` : '/api/clients';
    const method = editingClientId ? 'PUT' : 'POST';

    authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) {
        setShowClientModal(false);
        fetchClients();
      }
    });
  };

  const inputStyle = { padding: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' };

  return (
    <div className="animate-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2rem' }}>Base de Datos <span className="text-gradient-gold">de Clientes</span></h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="🔍 Buscar cliente, póliza..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', width: '250px' }}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'white', fontSize: '0.85rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="alphabetical-asc">🔤 Orden Alfabético (A-Z)</option>
            <option value="alphabetical-desc">🔤 Orden Alfabético (Z-A)</option>
            <option value="added-desc">🆕 Más Recientes Agregados</option>
            <option value="added-asc">⏳ Más Antiguos Agregados</option>
            <option value="emission-desc">📅 Emisión: Reciente a Antigua</option>
            <option value="emission-asc">📅 Emisión: Antigua a Reciente</option>
          </select>
          <label className="glass-card" style={{ padding: '10px 20px', cursor: 'pointer', border: '1px solid var(--accent-gold)', color: 'var(--accent-gold)' }}>
            📊 Migrar Excel
            <input type="file" hidden onChange={(e) => handleMigration(e.target.files[0])} />
          </label>
          <button onClick={openNewModal} className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>+ Nuevo Cliente</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0 0 8px 0', overflowX: 'auto', overscrollBehaviorX: 'none', width: '100%' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px' }}>Contratante</th>
              <th style={{ padding: '16px' }}>Asegurados</th>
              <th style={{ padding: '16px' }}>Correo</th>
              <th style={{ padding: '16px' }}>Teléfono</th>
              <th style={{ padding: '16px' }}>Póliza</th>
              <th style={{ padding: '16px' }}>Producto</th>
              <th style={{ padding: '16px' }}>Plan</th>
              <th style={{ padding: '16px' }}>Prima Anual</th>
              <th style={{ padding: '16px' }}>Prima (Cobro)</th>
              <th style={{ padding: '16px' }}>Moneda</th>
              <th style={{ padding: '16px' }}>Frecuencia</th>
              <th style={{ padding: '16px' }}>Modo</th>
              <th style={{ padding: '16px' }}>Emisión</th>
              <th style={{ padding: '16px' }}>F. Pago</th>
              <th style={{ padding: '16px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="15" style={{ padding: '40px', textAlign: 'center' }}>Procesando Cartera...</td></tr>
            ) : clients.length === 0 ? (
               <tr><td colSpan="15" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Aún no tienes clientes. Migra tu Excel o añade uno nuevo.</td></tr>
            ) : clients.filter(c => {
               const term = searchTerm.toLowerCase();
               return c.contractor?.toLowerCase().includes(term) ||
                      c.policyNumber?.toLowerCase().includes(term) ||
                      c.email?.toLowerCase().includes(term) ||
                      c.phone?.toLowerCase().includes(term) ||
                      c.insureds?.some(ins => ins.name?.toLowerCase().includes(term));
            }).sort((a, b) => {
              if (sortBy === 'alphabetical-asc') {
                return (a.contractor || '').localeCompare(b.contractor || '');
              }
              if (sortBy === 'alphabetical-desc') {
                return (b.contractor || '').localeCompare(a.contractor || '');
              }
              if (sortBy === 'added-desc') {
                return b.id - a.id;
              }
              if (sortBy === 'added-asc') {
                return a.id - b.id;
              }
              if (sortBy === 'emission-asc') {
                const dateA = a.emissionDate ? new Date(a.emissionDate) : new Date(0);
                const dateB = b.emissionDate ? new Date(b.emissionDate) : new Date(0);
                return dateA - dateB;
              }
              if (sortBy === 'emission-desc') {
                const dateA = a.emissionDate ? new Date(a.emissionDate) : new Date(0);
                const dateB = b.emissionDate ? new Date(b.emissionDate) : new Date(0);
                return dateB - dateA;
              }
              return 0;
            }).map((client) => (
              <tr key={client.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <td style={{ padding: '12px 16px', fontWeight: '600' }}>
                  {client.contractor}<br/>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>🎂 {formatBirthday(client.contractorBirthDate)}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>
                  {client.insureds && client.insureds.map((ins, idx) => (
                    <div key={idx} style={{ color: 'var(--text-muted)' }}>
                      • {ins.name} <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>(🎂 {formatBirthday(ins.birthDate)})</span>
                    </div>
                  ))}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{client.email}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{client.phone}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{client.policyNumber}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{client.product}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{client.planType}</td>
                <td style={{ padding: '12px 16px' }}>${client.annualPremium?.toLocaleString() || '0.00'}</td>
                <td style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>${client.premium?.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>{client.currency || 'UDI'}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>{client.paymentFrequency}</td>
                <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>{client.paymentMethod}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{client.emissionDate}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>{client.collectionDate}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => setSelectedClient(client)} className="btn-primary" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.75rem' }}>Expediente</button>
                    <button onClick={() => openEditModal(client)} style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none' }}>Editar</button>
                    <button onClick={() => handleDelete(client.id)} style={{ color: '#ff4444', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none' }}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar Cliente */}
      {showClientModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-up" style={{ width: '550px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>{editingClientId ? 'Editar Cliente' : 'Añadir Nuevo Cliente'}</h2>
              <button onClick={() => setShowClientModal(false)} style={{ fontSize: '1.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
            </div>
            
            <form onSubmit={handleSubmitClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {!editingClientId && (
                <div style={{
                  background: 'rgba(226,176,66,0.03)',
                  border: '1px dashed var(--accent-gold)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  marginBottom: '8px',
                  position: 'relative',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(226,176,66,0.08)';
                  e.currentTarget.style.borderColor = '#ffd700';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(226,176,66,0.03)';
                  e.currentTarget.style.borderColor = 'var(--accent-gold)';
                }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="12" y1="18" x2="12" y2="12"></line>
                      <polyline points="9 15 12 12 15 15"></polyline>
                    </svg>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'white' }}>
                      Lectura Inteligente de Póliza
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Sube la carátula en PDF para rellenar el formulario automáticamente
                    </div>
                    <label className="btn-primary" style={{
                      marginTop: '8px',
                      padding: '6px 16px',
                      fontSize: '0.75rem',
                      width: 'auto',
                      background: 'rgba(226,176,66,0.2)',
                      color: 'var(--accent-gold)',
                      border: '1px solid var(--accent-gold)',
                      cursor: 'pointer',
                      display: 'inline-block'
                    }}>
                      {parsingPdf ? 'Analizando carátula...' : '📄 Seleccionar PDF'}
                      <input type="file" accept="application/pdf" hidden disabled={parsingPdf} onChange={(e) => handlePolicyParse(e.target.files[0])} />
                    </label>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Nombre del Contratante</label>
                  <input required value={clientData.contractor} onChange={e => setClientData({...clientData, contractor: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Nacimiento (Contratante)</label>
                  <input type="date" value={clientData.contractorBirthDate} onChange={e => setClientData({...clientData, contractorBirthDate: e.target.value})} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Teléfono (WhatsApp)</label>
                  <input value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Correo Electrónico</label>
                  <input type="email" value={clientData.email} onChange={e => setClientData({...clientData, email: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>Asegurados</label>
                  <button type="button" onClick={() => setClientData({...clientData, insureds: [...clientData.insureds, {name: '', birthDate: ''}]})} style={{ fontSize: '0.75rem', background: 'rgba(226,176,66,0.2)', color: 'var(--accent-gold)', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>+ Añadir Asegurado</button>
                </div>
                {clientData.insureds.map((ins, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'block' }}>Nombre del Asegurado</label>
                      <input placeholder="Asegurado" value={ins.name} onChange={e => {
                        const newIns = [...clientData.insureds];
                        newIns[idx].name = e.target.value;
                        setClientData({...clientData, insureds: newIns});
                      }} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'block' }}>Nacimiento</label>
                      <input type="date" value={ins.birthDate} onChange={e => {
                        const newIns = [...clientData.insureds];
                        newIns[idx].birthDate = e.target.value;
                        setClientData({...clientData, insureds: newIns});
                      }} style={inputStyle} />
                    </div>
                    {clientData.insureds.length > 1 && (
                      <button type="button" onClick={() => {
                        const newIns = clientData.insureds.filter((_, i) => i !== idx);
                        setClientData({...clientData, insureds: newIns});
                      }} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '10px' }}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Póliza</label>
                  <input required value={clientData.policyNumber} onChange={e => setClientData({...clientData, policyNumber: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Ramo</label>
                  <select value={clientData.product} onChange={e => {
                      const newProduct = e.target.value;
                      let newCurrency = clientData.currency;
                      if (newProduct === 'GMM') newCurrency = 'MXN';
                      else if (newCurrency === 'MXN') newCurrency = 'USD';
                      const defaultPlan = newProduct === 'GMM' ? 'Pleno' : 'Orvi';
                      setClientData({...clientData, product: newProduct, currency: newCurrency, planType: defaultPlan});
                    }} style={inputStyle}>
                     <option value="Vida">Vida</option>
                     <option value="GMM">Gastos Médicos Mayores (GMM)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Tipo de Plan</label>
                  <select value={clientData.planType} onChange={e => setClientData({...clientData, planType: e.target.value})} style={inputStyle}>
                    {clientData.product === 'GMM' ? (
                      <>
                        <option value="Pleno">Pleno</option>
                        <option value="Integro">Integro</option>
                        <option value="Practico">Practico</option>
                        <option value="Flex A">Flex A</option>
                        <option value="Flex B">Flex B</option>
                      </>
                    ) : (
                      <>
                        <option value="Orvi">Orvi</option>
                        <option value="Dotal">Dotal</option>
                        <option value="Vida mujer">Vida mujer</option>
                        <option value="Imagina ser">Imagina ser</option>
                        <option value="Nuevo planitud">Nuevo planitud</option>
                        <option value="Segubeca">Segubeca</option>
                        <option value="Mio">Mio</option>
                        <option value="Objetivo Vida">Objetivo Vida</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Fecha de Emisión</label>
                  <input type="date" value={clientData.emissionDate} onChange={e => setClientData({...clientData, emissionDate: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Fecha de Pago / Cobro</label>
                  <input type="date" value={clientData.collectionDate} onChange={e => setClientData({...clientData, collectionDate: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(226,176,66,0.2)' }}>
                 <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', marginBottom: '6px', display: 'block' }}>Prima Anual (Monto Total)</label>
                      <input required type="number" step="0.01" value={clientData.annualPremium} onChange={e => setClientData({...clientData, annualPremium: e.target.value})} style={{...inputStyle, borderColor: 'var(--accent-gold)'}} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Moneda</label>
                      <select value={clientData.currency} onChange={e => setClientData({...clientData, currency: e.target.value})} style={inputStyle} disabled={clientData.product === 'GMM'}>
                          {clientData.product === 'GMM' ? (
                            <option value="MXN">Pesos (MXN)</option>
                          ) : (
                            <>
                              <option value="UDI">UDI</option>
                              <option value="USD">Dólares (USD)</option>
                            </>
                          )}
                      </select>
                    </div>
                 </div>
                 
                 <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Frecuencia de Pago</label>
                    <select value={clientData.paymentFrequency} onChange={e => setClientData({...clientData, paymentFrequency: e.target.value})} style={inputStyle}>
                      <option value="MENSUAL">Mensual</option>
                      <option value="TRIMESTRAL">Trimestral</option>
                      <option value="SEMESTRAL">Semestral</option>
                      <option value="ANUAL">Anual</option>
                    </select>
                 </div>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Prima a Pagar ({clientData.paymentFrequency})</label>
                    <div style={{ padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', color: 'white', fontWeight: 'bold', fontSize: '1rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                      $ {calculatedPremium}
                    </div>
                 </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px', display: 'block' }}>Modo de Cobro</label>
                <select value={clientData.paymentMethod} onChange={e => setClientData({...clientData, paymentMethod: e.target.value})} style={inputStyle}>
                  <option value="TC">Tarjeta de Crédito (TC)</option>
                  <option value="TD">Tarjeta de Débito (TD)</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>

              <button type="submit" className="btn-primary" style={{ marginTop: '12px' }}>{editingClientId ? 'Guardar Cambios' : 'Guardar Cliente'}</button>
            </form>
          </div>
        </div>
      )}

      {selectedClient && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-up" style={{ width: '600px', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2>Expediente: {selectedClient.contractor}</h2>
              <button onClick={() => setSelectedClient(null)} style={{ fontSize: '1.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <div>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '12px' }}>Subir Documento</p>
                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', borderRadius: '8px', marginBottom: '12px', border: '1px solid var(--glass-border)' }}>
                  <option value="Poliza">📄 Póliza</option>
                  <option value="INE">🪪 INE</option>
                  <option value="Pago">💰 Comprobante</option>
                  <option value="Otros">📂 Otros</option>
                </select>
                <input type="file" onChange={(e) => handleUpload(selectedClient.id, e.target.files[0])} style={{ fontSize: '0.8rem' }} />
              </div>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '12px' }}>Documentos</p>
                {selectedClient.documents.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sin archivos.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {selectedClient.documents.map((doc, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                        <a href={`http://localhost:5001/${doc.path}`} target="_blank" style={{ color: 'var(--accent-gold)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', display: 'inline-block', whiteSpace: 'nowrap' }} title={doc.name}>
                          [{doc.category}] {doc.name}
                        </a>
                        <button 
                          onClick={() => handleDeleteDoc(selectedClient.id, i)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ff4444',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                          title="Eliminar documento del expediente"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedClient(null)} className="btn-primary">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
