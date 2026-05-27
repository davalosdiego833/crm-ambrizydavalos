/**
 * Motor de Cálculo de Bonos Ambriz v1.0
 * Calcula proyecciones financieras basadas en metas de cobranza.
 */
const calculateBonus = (paidPremium, persistence) => {
  let bonusRate = 0;
  
  // Rangos de Bono por Primas
  if (paidPremium >= 500000) {
    bonusRate = 0.15; // 15%
  } else if (paidPremium >= 200000) {
    bonusRate = 0.10; // 10%
  } else if (paidPremium >= 100000) {
    bonusRate = 0.05; // 5%
  }

  // Multiplicador de Calidad (Persistencia)
  if (persistence >= 0.90) {
    bonusRate += 0.02; // +2% extra por excelente persistencia
  }

  const projectedBonus = paidPremium * bonusRate;

  // Siguiente Nivel
  let nextLevel = null;
  if (paidPremium < 100000) nextLevel = 100000;
  else if (paidPremium < 200000) nextLevel = 200000;
  else if (paidPremium < 500000) nextLevel = 500000;

  return {
    projectedBonus,
    bonusRate: bonusRate * 100,
    amountToNextLevel: nextLevel ? nextLevel - paidPremium : 0,
    progress: nextLevel ? (paidPremium / nextLevel) * 100 : 100
  };
};

module.exports = { calculateBonus };
