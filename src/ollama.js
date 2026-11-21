// Conexión con Ollama (IA local). Si Ollama no está corriendo, el bot
// sigue funcionando solo con el menú.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const OLLAMA_ACTIVO = (process.env.OLLAMA_ACTIVO || 'true').toLowerCase() === 'true';
// 12 s: si la IA tarda más, el estudiante recibe el menú en vez de esperar sin respuesta.
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 12000);

// "riesgo" no es una carta: si la IA la elige, el bot manda el mensaje de crisis.
const CATEGORIAS = ['estres', 'ansiedad', 'tristeza', 'sueno', 'pausa', 'soledad', 'riesgo'];

const PROMPT_SISTEMA = `Eres el asistente del "Botiquín para la calma" de LiFE Bienestar Estudiantil del Tec.
Hablas con estudiantes universitarios por WhatsApp, SIEMPRE en español de México, con calidez y respeto.

Tu tarea: leer el mensaje del estudiante y responder SOLO con un JSON así:
{"categoria": "<una de: riesgo, estres, ansiedad, tristeza, sueno, pausa, soledad, ninguna>", "respuesta": "<1 o 2 frases empáticas en español>"}

Categorías:
- riesgo: cualquier idea de morir, suicidarse, hacerse daño, desaparecer, no querer vivir o despertar, sentir que estarían mejor sin él/ella, sentirse sin salida, o estar en peligro. Si dudas entre riesgo y otra categoría, elige riesgo.
- estres: presión por tareas, exámenes, entregas, falta de tiempo, sentirse abrumado.
- ansiedad: nervios, miedo, preocupación intensa, corazón acelerado, sentir que algo malo va a pasar.
- tristeza: desánimo, ganas de llorar, rupturas, pérdidas, no tener ganas de nada.
- sueno: no poder dormir, desvelos, insomnio, cansancio por falta de sueño.
- pausa: saturación, llevar muchas horas estudiando o trabajando, necesitar un descanso.
- soledad: sentirse solo, sin amigos, aislado, lejos de casa, no conocer a nadie.
- ninguna: el mensaje no habla de cómo se siente (preguntas generales, horarios, entregas, saludos).

Ejemplos:
Mensaje: "no he pegado el ojo en toda la noche"
{"categoria": "sueno", "respuesta": "Pasar la noche sin dormir es agotador. Vamos a ayudarte a recuperar un poco de energía."}
Mensaje: "llevo todo el día frente a la compu y ya no rindo"
{"categoria": "pausa", "respuesta": "Has trabajado mucho hoy. Tu mente también necesita un respiro."}
Mensaje: "siento que todos estarían mejor sin mí"
{"categoria": "riesgo", "respuesta": ""}
Mensaje: "¿dónde queda la biblioteca?"
{"categoria": "ninguna", "respuesta": ""}

Reglas:
- "categoria" es el estado que mejor describe el mensaje.
- "respuesta" valida la emoción en máximo 2 frases cortas, en español. No hagas preguntas.
- No diagnostiques, no recetes medicamentos y no des consejos médicos.
- No inventes ejercicios: el sistema enviará uno del botiquín después de tu respuesta.`;

// Palabras muy comunes para saber si la frase de la IA salió en español o en inglés.
const PALABRAS_ES = new Set(['que', 'de', 'la', 'el', 'es', 'te', 'tu', 'y', 'en', 'un', 'una', 'lo', 'se', 'no', 'por', 'con', 'para', 'estas', 'esta', 'muy', 'mucho', 'puede', 'normal', 'sentir', 'vamos']);
const PALABRAS_EN = new Set(['the', 'you', 'your', 'that', 'this', 'is', 'are', 'it', 'its', "it's", 'and', 'to', 'i', 'sounds', 'really', 'feel', 'feeling', 'understand', 'can', 'be', 'of', 'with']);

function pareceEspanol(texto) { // true si la frase parece estar en español
  const palabras = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z']+/g) || [];
  const es = palabras.filter((p) => PALABRAS_ES.has(p)).length;
  const en = palabras.filter((p) => PALABRAS_EN.has(p)).length;
  return es >= en && es > 0;
}

async function interpretar(texto) {
  if (!OLLAMA_ACTIVO) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        keep_alive: '60m',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: PROMPT_SISTEMA },
          { role: 'user', content: texto },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);

    const data = await res.json();
    const json = JSON.parse(data.message.content);
    // El modelo a veces escribe "sueño" o "Estrés": se quitan acentos y mayúsculas.
    const crudo = String(json.categoria || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const categoria = CATEGORIAS.includes(crudo) ? crudo : null;
    // Si no es sobre emociones (o es riesgo) no se usa su respuesta: el modelo podría inventar datos
    // y en riesgo el bot manda el mensaje de crisis fijo. Tampoco se usa si salió en inglés o muy larga.
    let respuesta = categoria && categoria !== 'riesgo' && typeof json.respuesta === 'string' ? json.respuesta.trim() : '';
    if (respuesta && (respuesta.length > 300 || !pareceEspanol(respuesta))) respuesta = '';
    return { categoria, respuesta };
  } catch (err) {
    // Solo se registra el tipo de error, nunca el mensaje del estudiante.
    console.warn(`[ollama] sin respuesta (${err.name === 'AbortError' ? `tardó más de ${TIMEOUT_MS} ms` : err.message}). Se usa el menú.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Carga el modelo en memoria al arrancar para que el primer mensaje no tarde.
async function precalentar() {
  if (!OLLAMA_ACTIVO) return;
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: 'hola', keep_alive: '60m', options: { num_predict: 1 } }),
    });
    console.log('🤖 Modelo de IA cargado.');
  } catch (err) {
    console.warn(`[ollama] no está disponible (${err.message}). El bot funcionará solo con menú.`);
  }
}

module.exports = { interpretar, precalentar, pareceEspanol, OLLAMA_ACTIVO, OLLAMA_MODEL, TIMEOUT_MS };
