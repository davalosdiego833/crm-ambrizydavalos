import React, { useState, useEffect } from 'react';

const DEFAULT_TEMPLATES = {
  atraso: "Hola {Nombre}, espero que te encuentres muy bien. Te contacto de manera atenta para comentarte que tu póliza de *{Plan}* (No. *{Poliza}*) presenta un atraso de *{Dias}* en su pago programado.\n\nEl monto pendiente es de *{Monto}* con frecuencia de pago *{Frecuencia}*. Te comparto este aviso para poder regularizar tu cuenta a la brevedad y garantizar que tu protección siga completamente activa y sin interrupciones. Estoy a tu entera disposición si requieres apoyo con las formas de pago. ¡Saludos afectuosos!",
  mes: "Hola {Nombre}, ¡qué gusto saludarte! Te contacto con buena anticipación para comentarte que en un mes, el día *{Fecha}*, corresponde el cobro programado de tu póliza de *{Plan}* (No. *{Poliza}*).\n\nEl monto a cubrir es de *{Monto}* con frecuencia de pago *{Frecuencia}*. Nos gusta avisarte con tiempo para que puedas programarlo con total tranquilidad en tus presupuestos mensuales. ¡Que tengas un excelente día!",
  quinceDias: "Estimado(a) {Nombre}, espero que te encuentres muy bien. Te envío este breve recordatorio: en 15 días corresponde el pago de tu protección de *{Plan}* (Póliza *{Poliza}*).\n\nEl importe correspondiente es de *{Monto}* (Frecuencia: *{Frecuencia}*). Recuerda que estoy a tu entera disposición si requieres apoyo con los métodos de pago autorizados. ¡Saludos afectuosos!",
  cincoDias: "Hola {Nombre}, espero que estés teniendo una excelente semana. Te escribo para recordarte que el pago de tu póliza de *{Plan}* (No. *{Poliza}*) está próximo a vencer en 5 días.\n\nEl monto a cubrir es de *{Monto}* y tu frecuencia de pago es *{Frecuencia}*. Te comparto este aviso para que mantengamos tu protección y la de tu familia siempre activas y sin ningún contratiempo. ¡Quedo a tus órdenes si tienes alguna duda!",
  hoy: "Estimado(a) {Nombre}, gusto en saludarte. Te contacto para informarte que el día de hoy corresponde realizar el cobro programado de tu póliza de *{Plan}* (No. *{Poliza}*).\n\nEl monto correspondiente es de *{Monto}* (*{Frecuencia}*). Para tu comodidad y asegurar la continuidad de tus beneficios sin interrupciones, quedo al pendiente en este chat para recibir tu comprobante de pago o apoyarte en la transacción. ¡Muchas gracias por tu confianza!"
};

const CATEGORIES = [
  { id: 'atraso', label: '⏳ Pago Atrasado', color: '#ff4444' },
  { id: 'hoy', label: '🚨 Cobranza Hoy', color: 'var(--accent-mint)' },
  { id: 'cincoDias', label: '🗓️ En 5 Días', color: '#e2b042' },
  { id: 'quinceDias', label: '📅 En 15 Días', color: 'var(--accent-gold)' },
  { id: 'mes', label: '📆 En 1 Mes', color: 'var(--text-main)' }
];

const VARIABLES = [
  { tag: '{Nombre}', desc: 'Nombre del contratante' },
  { tag: '{Plan}', desc: 'Nombre del producto/plan' },
  { tag: '{Poliza}', desc: 'Número de póliza' },
  { tag: '{Monto}', desc: 'Monto formateado con moneda' },
  { tag: '{Frecuencia}', desc: 'Frecuencia de pago (ej. TRIMESTRAL)' },
  { tag: '{Dias}', desc: 'Días de atraso (solo para pagos vencidos)' },
  { tag: '{Fecha}', desc: 'Fecha de cobro (solo para avisos preventivos)' }
];

const TemplatesPanel = () => {
  const [templates, setTemplates] = useState(() => {
    const saved = localStorage.getItem('crm_message_templates');
    return saved ? JSON.parse(saved) : { ...DEFAULT_TEMPLATES };
  });

  const [activeCategory, setActiveCategory] = useState('atraso');
  const [currentText, setCurrentText] = useState(templates[activeCategory]);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    setCurrentText(templates[activeCategory]);
  }, [activeCategory, templates]);

  const handleSave = () => {
    const updated = {
      ...templates,
      [activeCategory]: currentText
    };
    setTemplates(updated);
    localStorage.setItem('crm_message_templates', JSON.stringify(updated));
    
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  const handleResetDefaults = () => {
    if (window.confirm('¿Estás seguro de restablecer esta plantilla a su valor predeterminado?')) {
      const resetText = DEFAULT_TEMPLATES[activeCategory];
      setCurrentText(resetText);
      const updated = {
        ...templates,
        [activeCategory]: resetText
      };
      setTemplates(updated);
      localStorage.setItem('crm_message_templates', JSON.stringify(updated));
    }
  };

  // Generador de vista previa viva con datos ficticios de demostración
  const getPreviewText = () => {
    const fakeClient = {
      name: "Lic. Carlos Mendoza",
      plan: "SeguBeca",
      policy: "AD-998822",
      monto: "USD 1,500",
      frecuencia: "SEMESTRAL",
      dias: "12 días",
      fecha: "15 de Junio de 2026"
    };

    return currentText
      .replace(/{Nombre}/g, fakeClient.name)
      .replace(/{Plan}/g, fakeClient.plan)
      .replace(/{Poliza}/g, fakeClient.policy)
      .replace(/{Monto}/g, fakeClient.monto)
      .replace(/{Frecuencia}/g, fakeClient.frecuencia)
      .replace(/{Dias}/g, fakeClient.dias)
      .replace(/{Fecha}/g, fakeClient.fecha);
  };

  return (
    <div className="animate-up" style={{ paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0 }}>
            Plantillas de <span className="text-gradient-gold">Mensajes</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: '4px' }}>
            Personaliza las alertas que copias y envías por WhatsApp a tus clientes.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
        {/* Panel lateral izquierdo - Selección de Plantilla */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Categorías de Alertas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(226, 176, 66, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid',
                      borderColor: isActive ? 'var(--accent-gold)' : 'var(--glass-border)',
                      color: isActive ? 'var(--accent-gold)' : 'var(--text-main)',
                      textAlign: 'left',
                      fontWeight: isActive ? 'bold' : 'normal',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.borderColor = 'var(--glass-border)';
                      }
                    }}
                  >
                    <span>{cat.label}</span>
                    {isActive && <span style={{ fontSize: '0.75rem' }}>⚡ activo</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Caja informativa de Comodines/Variables */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🔧 Comodines Disponibles
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: '1.4' }}>
              Utiliza estas etiquetas en tu texto. El CRM las reemplazará automáticamente con la información real de cada póliza y cliente.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {VARIABLES.map((v, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    // Copiar etiqueta al portapapeles de manera amistosa
                    navigator.clipboard.writeText(v.tag);
                    alert(`📋 Comodín ${v.tag} copiado. ¡Pégalo en tu plantilla!`);
                  }}
                  style={{ 
                    padding: '8px 12px', 
                    background: 'rgba(255, 255, 255, 0.01)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.background = 'rgba(226,176,66,0.03)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.01)'; }}
                  title="Haz clic para copiar comodín"
                >
                  <code style={{ fontSize: '0.75rem', color: 'var(--accent-gold)', fontWeight: 'bold' }}>{v.tag}</code>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Panel derecho - Editor de Plantilla y Vista Previa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Editor de Texto */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>
                Editar Plantilla: <span style={{ color: 'var(--accent-gold)' }}>{CATEGORIES.find(c => c.id === activeCategory)?.label}</span>
              </h3>
              <button 
                onClick={handleResetDefaults}
                style={{
                  fontSize: '0.75rem',
                  color: '#ff4444',
                  background: 'rgba(255, 68, 68, 0.05)',
                  border: '1px solid rgba(255, 68, 68, 0.2)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.05)'}
              >
                Restablecer Predeterminado
              </button>
            </div>

            <textarea
              value={currentText}
              onChange={(e) => setCurrentText(e.target.value)}
              rows="10"
              style={{
                width: '100%',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                lineHeight: '1.6',
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.3s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent-gold)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--glass-border)'}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                onClick={handleSave}
                className="btn-primary"
                style={{
                  padding: '12px 28px',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Guardar Plantilla
              </button>
            </div>
          </div>

          {/* Vista Previa Viva */}
          <div className="glass-card" style={{ padding: '24px', borderLeft: '3px solid var(--accent-gold)' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              👁️ Vista Previa de Envío (WhatsApp)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '20px' }}>
              Así se verá el mensaje real enviado al cliente en WhatsApp, con formato de negritas (`*texto*`) aplicado.
            </p>

            <div 
              style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--glass-border)', 
                padding: '20px', 
                borderRadius: '10px', 
                color: 'var(--text-main)', 
                fontSize: '0.9rem', 
                lineHeight: '1.6', 
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit'
              }}
            >
              {getPreviewText()}
            </div>
          </div>
        </div>
      </div>

      {/* Notificación Toast de Éxito */}
      {showToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--accent-mint)',
            color: '#000',
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            boxShadow: '0 4px 15px rgba(0, 255, 170, 0.3)',
            zIndex: 9999,
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          ✅ Plantilla guardada con éxito
        </div>
      )}
    </div>
  );
};

export default TemplatesPanel;
