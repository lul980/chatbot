// Pruebas de la parte de IA con un Ollama SIMULADO (no hace falta tener Ollama instalado).
// El servidor falso contesta según el texto del estudiante, como lo haría un modelo pequeño.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const REGLAS = [
  // [si el mensaje contiene, lo que "contesta el modelo", retraso en ms]
  ['soy una carga', '{"categoria": "riesgo", "respuesta": "Lo siento mucho."}', 50],
  ['examen', '{"categoria": "Estrés", "respuesta": "Es normal sentir presión antes de un examen."}', 50],
  ['pegado el ojo', '{"categoria": "sueño", "respuesta": "Pasar la noche sin dormir es agotador."}', 50],
  ['english', '{"categoria": "estres", "respuesta": "I understand, that sounds really stressful."}', 50],
  ['json roto', 'Claro, aquí está: {categoria: estres', 50],
  ['lento', '{"categoria": "pausa", "respuesta": "Respira."}', 3000],
  ['fatal', '{"categoria": "tristeza", "respuesta": "Lamento que tengas un mal día."}', 50],
  ['biblioteca', '{"categoria": "ninguna", "respuesta": "La biblioteca está en el edificio 4."}', 50],
];

let servidor;
let llamadas = 0;
let responder;
let mensajes;

test.before(async () => {
  servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      llamadas += 1;
      const body = JSON.parse(cuerpo || '{}');
      const usuario = ((body.messages || []).find((m) => m.role === 'user') || {}).content || '';
      const regla = REGLAS.find(([clave]) => usuario.toLowerCase().includes(clave)) || [null, '{"categoria": "ninguna", "respuesta": ""}', 20];
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: { role: 'assistant', content: regla[1] }, done: true }));
      }, regla[2]);
    });
  });
  await new Promise((r) => servidor.listen(0, r));
  process.env.OLLAMA_ACTIVO = 'true';
  process.env.OLLAMA_URL = `http://127.0.0.1:${servidor.address().port}`;
  process.env.OLLAMA_TIMEOUT_MS = '1000';
  process.env.WELLNESS_MAPS_URL = 'https://maps.example.com/wellness';
  ({ responder } = require('../src/conversacion'));
  ({ mensajes } = require('../src/mensajes'));
});

test.after(() => servidor.close());

let n = 0;
const usuario = () => `ia-${++n}`;
const textos = (rs) => rs.map((r) => r.texto);

test('si la IA detecta riesgo, manda el mensaje de crisis (aunque no haya palabras de la lista)', async () => {
  const rs = await responder(usuario(), 'siento que soy una carga para todos');
  assert.deepEqual(textos(rs), [mensajes.crisis]);
});

test('la IA revisa riesgo aunque el mensaje tenga palabras clave de una carta', async () => {
  const rs = await responder(usuario(), 'estoy muy triste y siento que soy una carga');
  assert.deepEqual(textos(rs), [mensajes.crisis]);
});

test('la frase empática de la IA se usa cuando coincide con la carta', async () => {
  const rs = await responder(usuario(), 'no he pegado el ojo en toda la noche');
  assert.ok(textos(rs).includes('Pasar la noche sin dormir es agotador.'));
});

test('respuestas de la IA en inglés no se mandan', async () => {
  const rs = await responder(usuario(), 'english please, I am stressed');
  assert.ok(!textos(rs).some((t) => /understand/.test(t)));
  assert.ok(textos(rs).includes(mensajes.preguntaSeguimiento)); // igual manda el ejercicio de estrés
});

test('si la IA contesta algo que no es JSON, el bot no se cae', async () => {
  const rs = await responder(usuario(), 'json roto');
  assert.ok(textos(rs).includes(mensajes.menu));
});

test('si la IA tarda demasiado, el bot contesta con el menú', async () => {
  const inicio = Date.now();
  const rs = await responder(usuario(), 'algo lento me pasa');
  assert.ok(Date.now() - inicio < 2500);
  assert.ok(textos(rs).includes(mensajes.menu));
});

test('preguntas fuera de tema no usan lo que invente la IA', async () => {
  const rs = await responder(usuario(), '¿dónde está la biblioteca?');
  assert.ok(!textos(rs).some((t) => /edificio 4/.test(t)));
  assert.ok(textos(rs).includes(mensajes.fueraDeTema));
});

test('un número del menú no gasta una llamada a la IA', async () => {
  const antes = llamadas;
  await responder(usuario(), '2');
  assert.equal(llamadas, antes);
});

test('"hola, me siento fatal" ya no se queda solo en el menú', async () => {
  const rs = await responder(usuario(), 'hola\nme siento fatal hoy');
  assert.ok(textos(rs).includes(mensajes.preguntaSeguimiento));
});

test('con WELLNESS_MAPS_URL configurado manda el enlace de Maps', async () => {
  const rs = await responder(usuario(), '¿dónde está bienestar estudiantil?');
  assert.ok(textos(rs).some((t) => t.includes('https://maps.example.com/wellness')));
});
