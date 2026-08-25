import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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

const calculatePolicyAgeInMonths = (emissionDateStr) => {
  if (!emissionDateStr) return 0;
  const emission = new Date(emissionDateStr);
  if (isNaN(emission.getTime())) return 0;
  const hoy = new Date();
  
  let anosDif = hoy.getFullYear() - emission.getFullYear();
  let mesesDif = hoy.getMonth() - emission.getMonth();
  
  let totalMeses = (anosDif * 12) + mesesDif;
  
  if (hoy.getDate() < emission.getDate()) {
    totalMeses--;
  }
  
  return Math.max(0, totalMeses);
};

const formatAgeInYearsAndMonths = (totalMonths) => {
  if (totalMonths === 0) return '0 meses';
  
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  
  let parts = [];
  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  }
  if (months > 0 || years === 0) {
    parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  }
  
  return parts.join(' ');
};

// Ramos y planes propios de Ambriz & Dávalos (Vida/GMM). Novaris solo maneja
// Automotriz/MXN, así que estas listas no aplican para ese despacho.
const AMBRIZ_PLAN_OPTIONS = {
  GMM: ['Pleno', 'Integro', 'Practico', 'Flex A', 'Flex B'],
  Vida: ['Orvi', 'Dotal', 'Vida mujer', 'Imagina ser', 'Nuevo planitud', 'Segubeca', 'Mio', 'Objetivo Vida'],
};

const Clients = () => {
  const { user, authFetch } = useAuth();
  const isAmbriz = user?.company === 'ambriz';
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);
  const [docCategory, setDocCategory] = useState('Poliza');
  const [sortBy, setSortBy] = useState('alphabetical-asc');
  const [ageFilter, setAgeFilter] = useState('all'); // 'all', '13m', '14m'

  // Estados para Modal Cliente (Crear/Editar)
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState(null);

  const initialClientData = {
    contractor: '', contractorBirthDate: '', email: '', phone: '',
    policyNumber: '', product: isAmbriz ? 'Vida' : 'Automotriz', planType: isAmbriz ? 'Orvi' : '',
    emissionDate: '', collectionDate: '',
    paymentFrequency: 'MENSUAL', paymentMethod: 'TC',
    annualPremium: '', currency: isAmbriz ? 'UDI' : 'MXN',
    insureds: [],
    highlighted: false
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
        setClientData(prev => ({
          ...prev,
          contractor: info.contractor || prev.contractor,
          contractorBirthDate: (info.insureds && info.insureds[0]?.birthDate) || prev.contractorBirthDate,
          policyNumber: info.policyNumber || prev.policyNumber,
          product: isAmbriz ? (info.product || prev.product) : 'Automotriz',
          planType: info.planType || prev.planType,
          emissionDate: info.emissionDate || prev.emissionDate,
          collectionDate: info.collectionDate || prev.collectionDate,
          paymentFrequency: info.paymentFrequency || prev.paymentFrequency,
          currency: isAmbriz ? (info.currency || prev.currency) : 'MXN',
          annualPremium: info.premium ? parseFloat(info.premium).toFixed(2) : prev.annualPremium
        }));
        alert('¡Carátula leída con éxito! Revisa la información autollenada en el formulario.');
      } else {
        alert('No se pudo extraer información de la carátula. Intenta subir otra carátula.');
      }
    })
    .catch(err => {
      console.error(err);
      alert('Error al leer el PDF de la carátula.');
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

  const handleAnnul = (clientId) => {
    if(!confirm('¿Estás seguro de anular esta póliza manualmente? Se pondrá en pausa y no sumará en las estadísticas.')) return;
    authFetch(`/api/clients/${clientId}/annul`, {
      method: 'PUT'
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) fetchClients();
    });
  };

  const handleReactivate = (clientId) => {
    if(!confirm('¿Deseas reactivar esta póliza? Se marcará como Pagada para el mes en curso y sumará directamente a tus ingresos del mes.')) return;
    authFetch(`/api/clients/${clientId}/reactivate`, {
      method: 'PUT'
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) fetchClients();
    });
  };

    const handleToggleHighlight = (clientId) => {
      authFetch(`/api/clients/${clientId}/toggle-highlight`, {
        method: 'PUT'
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) fetchClients();
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
      product: isAmbriz ? (client.product || 'Vida') : 'Automotriz',
      planType: client.planType || '',
      emissionDate: client.emissionDate || '',
      collectionDate: client.collectionDate || '',
      paymentFrequency: client.paymentFrequency || 'MENSUAL',
      paymentMethod: client.paymentMethod || 'TC',
      annualPremium: client.annualPremium || '',
      currency: isAmbriz ? (client.currency || 'UDI') : 'MXN',
      insureds: [],
      highlighted: client.highlighted || false
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

  const inputStyle = { 
    padding: '10px 14px', 
    background: '#ffffff', 
    border: '1px solid #cbd5e1', 
    borderRadius: '8px', 
    color: '#0f172a', 
    fontSize: '0.85rem', 
    width: '100%', 
    boxSizing: 'border-box',
    outline: 'none'
  };

  return (
    <div className="animate-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--text-main)' }}>Base de Datos <span className="text-gradient-gold">de Clientes</span></h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Buscar cliente, póliza..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ padding: '10px 16px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '0.85rem', width: '250px', outline: 'none' }}
          />
          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
            style={{ padding: '10px 16px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '0.85rem', outline: 'none', cursor: 'pointer', fontWeight: '500' }}
          >
            <option value="all">Todas las Antigüedades</option>
            <option value="13m">Primeros 13 Meses</option>
            <option value="14m">14 Meses o más</option>
            <option value="annulled">Pólizas Anuladas</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '10px 16px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '0.85rem', outline: 'none', cursor: 'pointer', fontWeight: '500' }}
          >
            <option value="alphabetical-asc">Orden Alfabético (A-Z)</option>
            <option value="alphabetical-desc">Orden Alfabético (Z-A)</option>
            <option value="added-desc">Más Recientes Agregados</option>
            <option value="added-asc">Más Antiguos Agregados</option>
            <option value="emission-desc">Emisión: Reciente a Antigua</option>
            <option value="emission-asc">Emisión: Antigua a Reciente</option>
          </select>
          <button onClick={openNewModal} className="btn-primary" style={{ width: 'auto', padding: '10px 20px' }}>+ Nuevo Cliente</button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '0 0 8px 0', overflowX: 'auto', overscrollBehaviorX: 'none', width: '100%' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '16px' }}>Contratante</th>
              <th style={{ padding: '16px' }}>Correo</th>
              <th style={{ padding: '16px' }}>Teléfono</th>
              <th style={{ padding: '16px' }}>Póliza</th>
              <th style={{ padding: '16px' }}>Ramo</th>
              <th style={{ padding: '16px' }}>Tipo de Plan</th>
              <th style={{ padding: '16px' }}>Prima Anual</th>
              <th style={{ padding: '16px' }}>Prima (Cobro)</th>
              <th style={{ padding: '16px' }}>Moneda</th>
              <th style={{ padding: '16px' }}>Frecuencia</th>
              <th style={{ padding: '16px' }}>Modo</th>
              <th style={{ padding: '16px' }}>Emisión</th>
              <th style={{ padding: '16px' }}>Antigüedad</th>
              <th style={{ padding: '16px' }}>F. Pago</th>
              <th style={{ padding: '16px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="14" style={{ padding: '40px', textAlign: 'center' }}>Procesando Cartera...</td></tr>
            ) : clients.length === 0 ? (
               <tr><td colSpan="14" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Aún no tienes clientes registrados. Añade uno nuevo con el botón superior.</td></tr>
            ) : clients.filter(c => {
               const term = searchTerm.toLowerCase();
               const matchesSearch = c.contractor?.toLowerCase().includes(term) ||
                      c.policyNumber?.toLowerCase().includes(term) ||
                      c.email?.toLowerCase().includes(term) ||
                      c.phone?.toLowerCase().includes(term);
               
               if (!matchesSearch) return false;
               
               if (ageFilter === 'all') return true; // Mostrar todo (incluyendo anuladas) por defecto
               if (ageFilter === 'annulled') return c.status === 'Anulada';
               
               // Para filtros de antigüedad, solo consideramos pólizas activas (no anuladas)
               if (c.status === 'Anulada') return false;
               
               const age = calculatePolicyAgeInMonths(c.emissionDate);
               if (ageFilter === '13m') return age <= 13;
               if (ageFilter === '14m') return age >= 14;
               
               return true;
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
            }).map((client) => {
              const ageInMonths = calculatePolicyAgeInMonths(client.emissionDate);
              const isNewPolicy = ageInMonths <= 13;
              const isAnnulled = client.status === 'Anulada';
              
              return (
                <tr 
                  key={client.id} 
                  style={{ 
                    borderBottom: '1px solid var(--glass-border)',
                    opacity: isAnnulled ? 0.4 : 1,
                    transition: 'all 0.3s',
                    background: client.highlighted ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                    borderLeft: client.highlighted ? '4px solid var(--accent-gold)' : '4px solid transparent',
                    boxShadow: client.highlighted ? 'inset 0 0 10px rgba(37, 99, 235, 0.05)' : 'none'
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: '600', textDecoration: isAnnulled ? 'line-through' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{client.contractor}</span>
                      {client.highlighted && (
                        <span style={{ 
                          fontSize: '0.65rem', 
                          background: 'rgba(37, 99, 235, 0.12)', 
                          color: '#1e40af', 
                          padding: '2px 8px', 
                          borderRadius: '4px', 
                          fontWeight: 'bold',
                          border: '1px solid rgba(37, 99, 235, 0.25)'
                        }}>
                          Identificado
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none', display: 'inline-block', marginTop: '4px' }}>Nacimiento: {formatBirthday(client.contractorBirthDate)}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.email}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.phone}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.9rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.policyNumber}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.9rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.product || (isAmbriz ? 'Vida' : 'Automotriz')}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.planType}</td>
                  <td style={{ padding: '12px 16px', textDecoration: isAnnulled ? 'line-through' : 'none' }}>${client.annualPremium?.toLocaleString() || '0.00'}{isAmbriz ? '' : ' MXN'}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 'bold', color: 'var(--accent-gold)', textDecoration: isAnnulled ? 'line-through' : 'none' }}>${client.premium?.toLocaleString()}{isAmbriz ? '' : ' MXN'}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.currency || (isAmbriz ? 'UDI' : 'MXN')}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.paymentFrequency}</td>
                  <td style={{ padding: '12px 16px', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.paymentMethod}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem', textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.emissionDate}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: isAnnulled ? '#f1f5f9' : isNewPolicy ? 'rgba(5, 150, 105, 0.1)' : 'rgba(37, 99, 235, 0.1)', 
                      color: isAnnulled ? 'var(--text-dim)' : isNewPolicy ? '#059669' : '#1e40af', 
                      padding: '4px 8px', 
                      borderRadius: '6px', 
                      fontWeight: 'bold',
                      display: 'inline-block'
                    }}>
                      {isAnnulled ? 'ANULADA' : formatAgeInYearsAndMonths(ageInMonths)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                    <span style={{ textDecoration: isAnnulled ? 'line-through' : 'none' }}>{client.collectionDate}</span>
                    {!isAnnulled && client.status === 'Pendiente' && client.collectionDate && (
                      (() => {
                        const dueDate = new Date(client.collectionDate + 'T00:00:00');
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        dueDate.setHours(0,0,0,0);
                        if (today > dueDate) {
                          const diffTime = today - dueDate;
                          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                          const daysLeft = Math.max(0, 30 - diffDays);
                          return (
                            <div style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 'bold', marginTop: '4px' }}>
                              Aviso: {diffDays} {diffDays === 1 ? 'día' : 'días'} de atraso. Quedan {daysLeft} {daysLeft === 1 ? 'día' : 'días'} para cancelarse.
                            </div>
                          );
                        }
                        return null;
                      })()
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button onClick={() => openEditModal(client)} style={{ color: 'var(--accent-gold)', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none', fontWeight: '600' }}>Editar</button>
                      <button 
                        onClick={() => handleToggleHighlight(client.id)} 
                        style={{ 
                          color: client.highlighted ? 'var(--accent-gold)' : 'var(--text-dim)', 
                          fontSize: '0.75rem', 
                          cursor: 'pointer', 
                          background: 'none', 
                          border: 'none',
                          fontWeight: client.highlighted ? 'bold' : 'normal'
                        }}
                        title={client.highlighted ? "Quitar marca de identificación" : "Identificar este cliente"}
                      >
                        {client.highlighted ? 'Desmarcar' : 'Identificar'}
                      </button>
                      {isAnnulled ? (
                        <button 
                          onClick={() => handleReactivate(client.id)} 
                          style={{ color: '#00c853', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 'bold' }}
                        >
                          Reactivar
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleAnnul(client.id)} 
                          style={{ color: '#ffaa00', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 'bold' }}
                        >
                          Anular
                        </button>
                      )}
                      <button onClick={() => handleDelete(client.id)} style={{ color: '#ff4444', fontSize: '0.75rem', cursor: 'pointer', background: 'none', border: 'none' }}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Crear/Editar Cliente */}
      {showClientModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-up" style={{ width: '580px', padding: '32px', maxHeight: '90vh', overflowY: 'auto', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 20px 40px rgba(15,23,42,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>{editingClientId ? 'Editar Cliente' : 'Añadir Nuevo Cliente'}</h2>
              <button 
                type="button"
                onClick={() => setShowClientModal(false)} 
                style={{ 
                  fontSize: '1.2rem', 
                  background: '#f1f5f9', 
                  border: '1px solid #cbd5e1', 
                  color: '#0f172a', 
                  cursor: 'pointer', 
                  width: '36px', 
                  height: '36px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                title="Cerrar modal"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmitClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Nombre del Contratante</label>
                  <input required value={clientData.contractor} onChange={e => setClientData({...clientData, contractor: e.target.value})} placeholder="Nombre completo" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Nacimiento (Contratante)</label>
                  <input type="date" value={clientData.contractorBirthDate} onChange={e => setClientData({...clientData, contractorBirthDate: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <input 
                  type="checkbox" 
                  id="highlighted" 
                  checked={clientData.highlighted || false} 
                  onChange={e => setClientData({...clientData, highlighted: e.target.checked})} 
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#1e40af' }} 
                />
                <label htmlFor="highlighted" style={{ fontSize: '0.85rem', color: '#0f172a', cursor: 'pointer', fontWeight: '600', userSelect: 'none' }}>
                  Identificar cliente (Resaltar fila completa en la base de datos)
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Teléfono (WhatsApp)</label>
                  <input value={clientData.phone} onChange={e => setClientData({...clientData, phone: e.target.value})} placeholder="Ej: 5512345678" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Correo Electrónico</label>
                  <input type="email" value={clientData.email} onChange={e => setClientData({...clientData, email: e.target.value})} placeholder="correo@ejemplo.com" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isAmbriz ? '1fr 1fr 1fr' : '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Póliza</label>
                  <input required value={clientData.policyNumber} onChange={e => setClientData({...clientData, policyNumber: e.target.value})} placeholder="Número de Póliza" style={inputStyle} />
                </div>
                {isAmbriz && (
                  <div>
                    <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Ramo</label>
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
                )}
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Tipo de Plan</label>
                  {isAmbriz ? (
                    <select value={clientData.planType} onChange={e => setClientData({...clientData, planType: e.target.value})} style={inputStyle}>
                      {(AMBRIZ_PLAN_OPTIONS[clientData.product] || AMBRIZ_PLAN_OPTIONS.Vida).map(plan => (
                        <option key={plan} value={plan}>{plan}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={clientData.planType} onChange={e => setClientData({...clientData, planType: e.target.value})} placeholder="Ej: Cobertura Amplia, RC, Amplia Plus..." style={inputStyle} />
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Fecha de Emisión</label>
                  <input type="date" value={clientData.emissionDate} onChange={e => setClientData({...clientData, emissionDate: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Fecha de Pago / Cobro</label>
                  <input type="date" value={clientData.collectionDate} onChange={e => setClientData({...clientData, collectionDate: e.target.value})} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                 <div style={{ gridColumn: 'span 2', display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ fontSize: '0.8rem', color: '#1e40af', marginBottom: '6px', display: 'block', fontWeight: '700' }}>Prima Anual (Monto Total{isAmbriz ? '' : ' MXN'})</label>
                      <input required type="number" step="0.01" value={clientData.annualPremium} onChange={e => setClientData({...clientData, annualPremium: e.target.value})} placeholder="Monto total anual" style={{...inputStyle, borderColor: '#2563eb', fontWeight: 'bold'}} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Moneda</label>
                      {isAmbriz ? (
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
                      ) : (
                        <input type="text" value="Pesos (MXN)" readOnly style={{...inputStyle, background: '#e2e8f0', color: '#475569', fontWeight: '600'}} />
                      )}
                    </div>
                 </div>
                 
                 <div>
                    <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Frecuencia de Pago</label>
                    <select value={clientData.paymentFrequency} onChange={e => setClientData({...clientData, paymentFrequency: e.target.value})} style={inputStyle}>
                      <option value="MENSUAL">Mensual</option>
                      <option value="TRIMESTRAL">Trimestral</option>
                      <option value="SEMESTRAL">Semestral</option>
                      <option value="ANUAL">Anual</option>
                    </select>
                 </div>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Prima a Pagar ({clientData.paymentFrequency})</label>
                    <div style={{ padding: '10px 14px', background: '#e2e8f0', borderRadius: '8px', color: '#0f172a', fontWeight: 'bold', fontSize: '1rem', border: '1px solid #cbd5e1' }}>
                      $ {calculatedPremium}{isAmbriz ? '' : ' MXN'}
                    </div>
                 </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '6px', display: 'block', fontWeight: '600' }}>Modo de Cobro</label>
                <select value={clientData.paymentMethod} onChange={e => setClientData({...clientData, paymentMethod: e.target.value})} style={inputStyle}>
                  <option value="TC">Tarjeta de Crédito (TC)</option>
                  <option value="TD">Tarjeta de Débito (TD)</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowClientModal(false)} style={{ padding: '12px 24px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontWeight: '600', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary">
                  {editingClientId ? 'Guardar Cambios' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {selectedClient && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card animate-up" style={{ width: '600px', padding: '32px', background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 20px 40px rgba(15,23,42,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.3rem', color: '#0f172a', margin: 0, fontWeight: '700' }}>Expediente: {selectedClient.contractor}</h2>
              <button onClick={() => setSelectedClient(null)} style={{ fontSize: '1.2rem', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', cursor: 'pointer', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
              <div>
                <p style={{ color: '#334155', fontSize: '0.85rem', marginBottom: '12px', fontWeight: '600' }}>Subir Documento</p>
                <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: '#ffffff', color: '#0f172a', borderRadius: '8px', marginBottom: '12px', border: '1px solid #cbd5e1', outline: 'none' }}>
                  <option value="Poliza">Póliza</option>
                  <option value="INE">INE</option>
                  <option value="Pago">Comprobante</option>
                  <option value="Otros">Otros</option>
                </select>
                <input type="file" onChange={(e) => handleUpload(selectedClient.id, e.target.files[0])} style={{ fontSize: '0.8rem', color: '#334155' }} />
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
                <p style={{ color: '#334155', fontSize: '0.85rem', marginBottom: '12px', fontWeight: '600' }}>Documentos</p>
                {selectedClient.documents.length === 0 ? <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Sin archivos.</p> : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {selectedClient.documents.map((doc, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                        <a href={`http://localhost:5001/${doc.path}`} target="_blank" style={{ color: '#1e40af', fontWeight: '600', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', display: 'inline-block', whiteSpace: 'nowrap' }} title={doc.name}>
                          [{doc.category}] {doc.name}
                        </a>
                        <button 
                          onClick={() => handleDeleteDoc(selectedClient.id, i)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            borderRadius: '4px',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)'}
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default Clients;
