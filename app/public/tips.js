(function attachTips(global) {
  const pool = [
    "Revisa las diagonales largas: una dama puede interceptar capturas lejanas.",
    "Si puedes coronar, calcula si conviene esperar para capturar más piezas primero.",
    "No ignores las capturas recomendadas: tu rival podría soplar tu ficha.",
    "Mantén tus damas controlando el centro para forzar al rival a malas rutas.",
    "Evita dejar peones aislados: se vuelven blancos fáciles para capturas múltiples.",
    "Antes de mover, busca si tu dama tiene doble captura disponible.",
    "Si ves varias capturas, prioriza eliminar damas enemigas aunque pierdas un peón.",
    "Bloquea las diagonales de coronación del rival con tus damas.",
    "Cuando captures con dama, calcula las casillas de aterrizaje seguras antes de saltar.",
    "Si tu rival omitió capturar, soplar a la dama es más valioso que un peón.",
    "Una cadena de capturas con dama puede abrir camino para coronar más peones.",
    "No muevas una dama a una esquina si no aseguras la salida en tu próximo turno.",
    "Usa tus peones para cebar capturas forzadas y ganar calidad con tu dama.",
    "Recuerda: las capturas opcionales siguen siendo preferibles, aunque puedas equivocarte.",
    "Mantén parejas de damas coordinadas para cubrirse mutuamente.",
    "Si dudas, espera: un movimiento defensivo puede obligar al rival a exponerse.",
    "Soplar ficha es una herramienta: amenaza con capturas para forzar errores.",
    "Las diagonales externas son peligrosas; controla el centro con tus piezas coronadas.",
    "Siempre confirma la ruta completa de captura antes de soltar la ficha.",
    "Una dama bien posicionada puede impedir que el rival corone; úsala para cortar avances."
  ];

  function getRandomTip() {
    if (!Array.isArray(pool) || pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  }

  global.tips = pool;
  global.getRandomTip = getRandomTip;
})(window);
