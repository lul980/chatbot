// Pruebas de la conversación SIN IA (OLLAMA_ACTIVO=false).
// Correr con: npm test
// Cada prueba usa un "usuario" distinto para que las sesiones no se mezclen.

process.env.OLLAMA_ACTIVO = 'false';
delete process.env.WELLNESS_MAPS_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { responder, esCrisis, normalizar } = require('../src/conversacion');
const { mensajes } = require('../src/mensajes');

let n = 0;
const nuevoUsuario = () => `prueba-${++n}`;
const textos = (rs) => rs.map((r) => r.texto);
const imagen = (rs) => rs.find((r) => r.tipo === 'imagen');
const mandoEjercicio = (rs) => textos(rs).includes(mensajes.preguntaSeguimiento);
const carta = (rs) => (imagen(rs) ? path.basename(imagen(rs).archivo, '.png') : null);

async function conversar(...mensajesEstudiante) {
  const usuario = nuevoUsuario();
  let ultima = [];
  for (const m of mensajesEstudiante) ultima = await responder(usuario, m);
  return ultima;
}

// ---------- Críticos ----------

test('el número de T Queremos es el oficial (800 813 9500)', () => {
  assert.match(mensajes.crisis, /800 813 9500/);
  assert.match(mensajes.respuestaPeor, /800 813 9500/);
  const src = fs.readdirSync(path.join(__dirname, '..', 'src'))
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /813 8500/);
});

test('detecta frases de riesgo comunes', async () => {
  const frases = [
    'quiero suicidarme', 'he pensado en el suicidio', 'quiero matarme', 'me quiero matar', 'me voy a matar',
    'quiero morirme', 'me quiero morir', 'ya no quiero vivir', 'no quiero seguir viviendo', 'quisiera estar muerto',
    'quisiera estar muerta', 'ya no quiero estar aquí', 'quiero desaparecer', 'quiero acabar con todo',
    'me quiero hacer daño', 'quiero lastimarme', 'me lastimo cuando estoy mal', 'me corto', 'me he cortado',
    'no le veo sentido a la vida', 'mejor si no existiera', 'ya no aguanto más', 'quiero quitarme la vida',
    'ME QUIERO MATAR!!!', 'siento que todos estarían mejor sin mí',
  ];
  for (const f of frases) {
    const rs = await conversar(f);
    assert.deepEqual(textos(rs), [mensajes.crisis], `no detectó: "${f}"`);
  }
});

test('detecta riesgo también a mitad de un ejercicio', async () => {
  const rs = await conversar('estoy triste', 'peor, me quiero morir');
  assert.deepEqual(textos(rs), [mensajes.crisis]);
});

test('no confunde frases inofensivas con crisis', () => {
  assert.equal(esCrisis(normalizar('quiero cortarme el pelo')), false);
  assert.equal(esCrisis(normalizar('me quiero morir de risa jaja')), false);
  assert.equal(esCrisis(normalizar('quiero cortarme')), true);
});

// ---------- Altos ----------

test('"no me siento mejor" y "ni mejor ni peor" no reciben "¡Qué bueno!"', async () => {
  for (const r of ['no me siento mejor', 'ni mejor ni peor', 'no estoy mejor']) {
    const rs = await conversar('estoy estresado', r);
    assert.ok(!textos(rs).includes(mensajes.respuestaMejor), `"${r}" recibió "¡Qué bueno!"`);
    assert.equal(textos(rs)[0], mensajes.respuestaIgual, `"${r}" debería contar como "igual"`);
  }
});

test('las respuestas normales al seguimiento siguen funcionando', async () => {
  assert.deepEqual(textos(await conversar('1', '1')), [mensajes.respuestaMejor]);
  assert.deepEqual(textos(await conversar('1', '¡Mejor!')), [mensajes.respuestaMejor]);
  assert.deepEqual(textos(await conversar('1', '10/10 mejor')), [mensajes.respuestaMejor]);
  assert.deepEqual(textos(await conversar('1', '3')), [mensajes.respuestaPeor]);
  assert.deepEqual(textos(await conversar('1', 'peor')), [mensajes.respuestaPeor]);
  assert.deepEqual(textos(await conversar('1', 'no estoy bien')), [mensajes.respuestaPeor]);
  assert.equal(textos(await conversar('1', 'igual'))[0], mensajes.respuestaIgual);
});

test('"salir" dentro de una frase no es despedida', async () => {
  const rs1 = await conversar('hola', 'no tengo ganas de salir de mi cuarto');
  assert.ok(!textos(rs1).includes(mensajes.despedida));
  const rs2 = await conversar('estoy triste', 'no quiero salir con nadie');
  assert.ok(!textos(rs2).includes(mensajes.despedida));
});

test('las despedidas cortas siguen funcionando', async () => {
  for (const d of ['salir', 'adiós', 'ok gracias, nos vemos', 'bye']) {
    assert.deepEqual(textos(await conversar('hola', d)), [mensajes.despedida], d);
  }
});

test('un mensaje que empieza con número no se toma como opción del menú', async () => {
  assert.equal(carta(await conversar('3 días sin dormir')), 'sueno');
  assert.notEqual(carta(await conversar('2 horas durmiendo y tengo examen')), 'ansiedad');
});

test('el número solo sí elige carta (también con emoji o "opción")', async () => {
  assert.equal(carta(await conversar('3')), 'tristeza');
  assert.equal(carta(await conversar('3️⃣')), 'tristeza');
  assert.equal(carta(await conversar('opción 4')), 'sueno');
  assert.equal(carta(await conversar('hola\n6')), 'soledad'); // mensajes seguidos juntados por la cola
});

// ---------- Medios ----------

test('reconoce preguntas por Bienestar Estudiantil y LiFE (no solo "wellness")', async () => {
  for (const p of ['¿dónde está el wellness center?', '¿dónde está la oficina de bienestar estudiantil?', 'donde queda life', '¿cómo llego a bienestar estudiantil?']) {
    assert.deepEqual(textos(await conversar(p)), [mensajes.wellnessPendiente], p);
  }
});

test('la IA tiene un límite de espera corto por defecto (12 s)', () => {
  const ollama = require('../src/ollama');
  assert.equal(ollama.TIMEOUT_MS, 12000);
});

// ---------- Menores ----------

test('"menú por favor" y "volver al menú" muestran el menú', async () => {
  for (const m of ['menú por favor', 'volver al menú', 'Menú']) {
    const rs = await conversar('hola', m);
    assert.deepEqual(textos(rs), [mensajes.menu], m);
  }
});

test('"otro" funciona después de responder "mejor"', async () => {
  const rs = await conversar('1', 'mejor', 'otro');
  assert.ok(mandoEjercicio(rs));
});

test('"otro" sin carta pide elegir una', async () => {
  const rs = await conversar('hola', 'otro');
  assert.deepEqual(textos(rs), [mensajes.otroSinCarta, mensajes.menu]);
});

test('"igual" cuando ya no quedan ejercicios manda un solo mensaje claro', async () => {
  const rs = await conversar('5', 'otro', 'otro', 'otro', 'otro', 'igual');
  assert.deepEqual(textos(rs), [mensajes.igualSinMas]);
});

test('preguntas informativas con "entrega" o "tarea" no mandan ejercicio', async () => {
  const rs = await conversar('¿cuándo es la entrega de la tarea?');
  assert.ok(!mandoEjercicio(rs));
  assert.ok(textos(rs).includes(mensajes.fueraDeTema));
});

test('"examen" sí cuenta cuando no es pregunta', async () => {
  assert.equal(carta(await conversar('mañana tengo examen y no me concentro')), 'estres');
});

// ---------- Extras encontrados al probar ----------

test('"algo extraño" no se toma como soledad, "extraño a mi familia" sí', async () => {
  assert.notEqual(carta(await conversar('me pasó algo extraño hoy')), 'soledad');
  assert.equal(carta(await conversar('extraño a mi familia')), 'soledad');
});

test('respeta la negación: "no estoy estresado, estoy triste"', async () => {
  assert.equal(carta(await conversar('no estoy estresado, estoy triste')), 'tristeza');
  assert.equal(carta(await conversar('no me siento solo, estoy cansado')), 'sueno');
  assert.equal(carta(await conversar('no he dormido nada')), 'sueno');
  assert.equal(carta(await conversar('no puedo dormir')), 'sueno');
});

test('flujo completo básico', async () => {
  const usuario = nuevoUsuario();
  const r1 = await responder(usuario, 'hola');
  assert.deepEqual(textos(r1), [mensajes.bienvenida, mensajes.menu]);
  const r2 = await responder(usuario, '1');
  assert.equal(carta(r2), 'estres');
  assert.ok(mandoEjercicio(r2));
  const r3 = await responder(usuario, 'mejor');
  assert.deepEqual(textos(r3), [mensajes.respuestaMejor]);
});

test('todas las imágenes de las cartas existen', () => {
  const { botiquin } = require('../src/botiquin');
  for (const c of botiquin) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'cartas', c.imagen)), c.imagen);
    assert.equal(c.ejercicios.length, 5, c.id);
  }
});
