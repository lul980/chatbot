// GUION DE LA CONVERSACIÓN
// --------------------------------------------------------------
// Todos los textos que manda el bot están aquí. Es una conversación
// estándar de prueba: el equipo de guion puede reemplazar estos textos
// sin tocar la lógica (src/conversacion.js).
//
// Formato de WhatsApp: *negritas*, _cursivas_, ~tachado~.

// Número oficial de la Línea TQueremos (24 h, 365 días): https://tqueremos.tec.mx/es/orientame
// ⚠️ Antes tenía un dígito equivocado (terminaba en 8500 en vez de 9500).
const LINEA_ATENCION = '800 813 9500'; // guarda el número de T Queremos para reutilizarlo en varios mensajes

const mensajes = { // objeto con todos los textos que manda el bot

  bienvenida: // primer mensaje que ve el estudiante
    '¡Hola! 👋😊 Soy el asistente del *Botiquín para la calma* 🌿 de LiFE Bienestar Estudiantil.\n\n' + // saludo y presentación del bot
    'Estoy aquí para darte un ejercicio rápido según cómo te sientas. ✨\n' + // explica para qué sirve el bot
    '_No sustituyo la atención de un profesional._ 🤝', // aviso de que no reemplaza a un profesional

  menu: // menú con las 6 cartas
    '¿Cómo te sientes hoy? 🤗 Responde con el número o cuéntame con tus palabras: 💬\n\n' + // pregunta inicial
    '1️⃣ Estoy estresado/a 😖\n' + // opción 1: estrés
    '2️⃣ Me siento ansioso/a 😰\n' + // opción 2: ansiedad
    '3️⃣ Hoy me siento triste 😢\n' + // opción 3: tristeza
    '4️⃣ No he dormido bien 😴\n' + // opción 4: sueño
    '5️⃣ Necesito una pausa ☕\n' + // opción 5: pausa
    '6️⃣ Me siento solo/a 🫂', // opción 6: soledad

  // Se manda justo antes del ejercicio. {titulo} = nombre de la carta.
  introEjercicio: 'Gracias por contarme 🙏. Para "{titulo}" te comparto este ejercicio 💙✨', // texto que acompaña la imagen de la carta

  preguntaSeguimiento: // pregunta de seguimiento después del ejercicio
    'Tómate tu tiempo para hacerlo ⏳. Cuando termines, cuéntame:\n\n' + // invita a hacer el ejercicio con calma
    '*¿Cómo te sientes ahora?* 🤔\n' + // la pregunta en negritas
    '1️⃣ Mejor 😊\n' + // respuesta 1
    '2️⃣ Igual 😐\n' + // respuesta 2
    '3️⃣ Peor 😞\n\n' + // respuesta 3
    'Escribe *otro* 🔄 para ver otro ejercicio o *menú* 🏠 para volver al inicio.', // comandos disponibles

  respuestaMejor: // cuando el estudiante responde "mejor"
    '¡Qué bueno! 🙌🎉 Recuerda que puedes volver al botiquín cuando lo necesites. 💙\n\n' + // cierre positivo
    'Escribe *menú* 📋 si quieres otro ejercicio.', // recuerda cómo volver al menú

  respuestaIgual: 'Está bien, a veces toma un poco más de tiempo 🕐💛. Probemos con otro ejercicio 👇:', // cuando responde "igual"

  igualSinMas: // cuando responde "igual" pero ya vio los 5 ejercicios de la carta
    'Está bien, a veces toma un poco más de tiempo 🕐💛. Ya vimos todos los ejercicios de esta carta ✅.\n\n' + // valida y avisa que ya no hay más
    'Escribe *menú* 📋 para probar con otra carta.\n' + // ofrece otra carta
    `Si sigues sintiéndote mal, puedes llamar a *T Queremos*: *${LINEA_ATENCION}* 📞`, // ofrece apoyo profesional

  respuestaPeor: // cuando el estudiante responde "peor"
    'Gracias por decírmelo 🙏. Lo que sientes es importante y no tienes que pasarlo solo/a. 💙🫂\n\n' + // validación emocional
    `📞 Llama al número de atención *T Queremos*: *${LINEA_ATENCION}*\n` + // da el teléfono de atención
    '🏫 O acércate a un punto de apoyo emocional en tu campus.\n\n' + // sugiere apoyo presencial
    'Si quieres, escribe *otro* 🔄 para intentar otro ejercicio o *menú* 🏠 para volver al inicio.', // opciones para seguir

  sinMasEjercicios: // cuando ya vio los 5 ejercicios de la carta
    'Ya vimos todos los ejercicios de esta carta ✅. Escribe *menú* 📋 para elegir otra.', // pide volver al menú

  noEntendi: // cuando el bot no entiende el mensaje
    'Perdón, no te entendí bien. 😅🙈', // disculpa breve

  fueraDeTema: // cuando hace una pregunta que no es sobre cómo se siente (horarios, entregas, trámites)
    'Esa no la sé 😅. Yo solo te puedo compartir ejercicios del *Botiquín para la calma* según cómo te sientas. 🌿', // aclara qué sí puede hacer

  otroSinCarta: // cuando pide "otro" pero todavía no ha elegido carta
    'Primero elige una carta y luego te comparto más ejercicios 👇', // pide elegir carta

  soloTexto: // cuando manda audio, foto, sticker, video o documento
    'Por ahora solo puedo leer mensajes de texto 📝. Escríbeme cómo te sientes o responde con un número del menú. 💬', // explica que solo lee texto

  // ===== WELLNESS CENTER ===== (textos para cuando preguntan dónde está; la foto y el enlace se configuran en conversacion.js)
  // Acompaña la foto de la fachada del Wellness Center.
  wellnessFoto: '📍 Este es el *Wellness Center* 🏢💙', // texto que acompaña la foto de la fachada
  // Acompaña el enlace de Google Maps. {enlace} = el enlace que se pega en conversacion.js.
  wellnessMapa: '🗺️ Aquí puedes ver cómo llegar:\n{enlace}', // texto con el enlace de Google Maps
  // Se manda al final, después de la foto y el mapa.
  wellnessCierre: 'Si necesitas algo más, escribe *menú* 📋 y te comparto un ejercicio 💙', // cierre después de dar la ubicación
  // Se manda mientras todavía falten la foto y el enlace.
  wellnessPendiente: 'Estoy actualizando la ubicación del *Wellness Center* 🛠️. Mientras tanto, pregunta en tu campus 🏫 o escribe *menú* 📋.', // aviso mientras falte la información

  // Se manda si detectamos palabras de riesgo (ver PALABRAS_CRISIS en conversacion.js).
  crisis: // mensaje de crisis
    '💙 Lo que estás sintiendo es muy importante y mereces apoyo ahora mismo. 🫂\n\n' + // validación
    `📞 Número de atención *T Queremos*: *${LINEA_ATENCION}*\n` + // teléfono de T Queremos
    '📞 Línea de la Vida (24 h): *800 911 2000*\n' + // teléfono de la Línea de la Vida
    '🚨 Si estás en peligro inmediato, llama al *911*.\n\n' + // emergencias
    'No estás solo/a. 🤍 Si quieres, sigo aquí contigo: escribe *menú* 📋 para hacer un ejercicio.', // acompañamiento

  despedida: // cuando el estudiante se despide
    'Gracias por cuidarte hoy. 💙🌸 Aquí estaré cuando me necesites 🤗, solo escribe *hola* 👋.', // mensaje de cierre
}; // fin del objeto de mensajes

module.exports = { mensajes, LINEA_ATENCION }; // exporta los textos para que conversacion.js los use
