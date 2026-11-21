// Cola de mensajes por estudiante.
//
// En WhatsApp la gente suele mandar varios mensajes seguidos ("hola" / "me siento fatal" / "no sé qué hacer").
// Sin esta cola, cada mensaje se contestaba por separado y al mismo tiempo: el estudiante recibía dos
// ejercicios de cartas distintas y en desorden.
//
// Con la cola:
//   1. Se espera un momento (esperaMs) por si llegan más mensajes del mismo estudiante y se juntan en uno.
//   2. Los mensajes de un mismo estudiante se contestan uno por uno, en el orden en que llegaron.
//   3. Estudiantes distintos no se esperan entre sí.

function crearCola(procesar, { esperaMs = 1500 } = {}) {
  const usuarios = new Map(); // usuario -> { textos, timer, cadena, pendientes }

  function recibir(usuario, texto) {
    let u = usuarios.get(usuario);
    if (!u) {
      u = { textos: [], timer: null, cadena: Promise.resolve(), pendientes: 0 };
      usuarios.set(usuario, u);
    }
    u.textos.push(texto);
    clearTimeout(u.timer); // llegó otro mensaje: vuelve a esperar
    u.timer = setTimeout(() => {
      const unido = u.textos.join('\n'); // cada mensaje queda en su propio renglón
      u.textos = [];
      u.timer = null;
      u.pendientes += 1;
      u.cadena = u.cadena
        .then(() => procesar(usuario, unido))
        .catch((err) => console.error('Error al responder:', err.message || err))
        .finally(() => {
          u.pendientes -= 1;
          // Si ya no hay nada pendiente de este estudiante, se libera la memoria.
          if (u.pendientes === 0 && !u.timer && u.textos.length === 0) usuarios.delete(usuario);
        });
    }, esperaMs);
  }

  // Espera a que se contesten todos los mensajes (sirve para las pruebas).
  async function vaciar() {
    while (usuarios.size > 0) {
      await new Promise((r) => setTimeout(r, esperaMs + 10));
      await Promise.all([...usuarios.values()].map((u) => u.cadena));
    }
  }

  return { recibir, vaciar };
}

module.exports = { crearCola };
