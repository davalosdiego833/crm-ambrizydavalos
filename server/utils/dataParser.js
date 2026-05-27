const XLSX = require('xlsx');

/**
 * Motor de Parsing Ambriz v1.0
 * Transforma reportes de aseguradora en objetos estructurados.
 */
const parseInsuranceReport = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Normalización de datos (Mapeo de columnas típicas)
    return data.map(row => ({
      clientName: row['Asegurado'] || row['Nombre'] || 'N/A',
      policyNumber: row['Póliza'] || row['Referencia'] || 'N/A',
      product: row['Ramo'] || row['Producto'] || 'Desconocido',
      dueDate: row['Fecha Vencimiento'] || row['Vence'] || null,
      amount: parseFloat(row['Prima'] || row['Importe'] || 0),
      status: row['Estatus'] || row['Estado'] || 'Pendiente'
    }));
  } catch (error) {
    console.error('Error en Parsing:', error);
    return [];
  }
};

module.exports = { parseInsuranceReport };
