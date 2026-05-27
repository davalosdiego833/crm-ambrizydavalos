/**
 * Servicio de Generación de Mensajes WhatsApp Ambriz v1.0
 */
const generateWALink = (phone, type, data) => {
  const cleanPhone = phone.replace(/\D/g, '');
  let message = '';

  const templates = {
    COBRANZA: `Hola ${data.name}, te saludo de Ambriz & Davalos. Te recordamos que tu póliza ${data.policy} tiene un pendiente de pago por ${data.amount}. ¿Te apoyo con la liga de pago?`,
    RENOVACION: `Hola ${data.name}, ¡buenas noticias! Tu póliza ${data.policy} está próxima a renovarse. Queremos asegurar que sigas protegido sin interrupciones. ¿Agendamos una breve llamada?`,
    CUMPLE: `¡Feliz cumpleaños ${data.name}! 🎂 De parte de todo el equipo de Ambriz Asesores, te deseamos un gran día lleno de éxito.`
  };

  message = templates[type] || templates.COBRANZA;
  
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
};

module.exports = { generateWALink };
