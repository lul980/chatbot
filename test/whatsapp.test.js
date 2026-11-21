// Pruebas de src/whatsapp.js con un WhatsApp FALSO (no abre navegador ni se conecta a nada).
// Sirven para revisar: audios/fotos, mensajes seguidos, privacidad de los logs y reconexión.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const { EventEmitter } = require('events');

process.env.OLLAMA_ACTIVO = 'false';
process.env.ESPERA_MENSAJES_MS = '80';
process.env.PAUSA_ENTRE_MENSAJES_MS = '0';
process.env.LOG_MENSAJES = 'false';

// ---- Módulos falsos (whatsapp-web.js, qrcode, dotenv) ----
const enviados = [];
let cliente;
class ClienteFalso extends EventEmitter {
  constructor() { super(); cliente = this; this.destruido = false; }
  initialize() { return Promise.resolve(); }
  sendMessage(destino, contenido, opciones) { enviados.push({ destino, contenido, opciones }); return Promise.resolve(); }
  getState() { return Promise.resolve('CONNECTED'); }
  destroy() { this.destruido = true; return Promise.resolve(); }
}
const falsos = {
  'whatsapp-web.js': {
    Client: ClienteFalso,
    LocalAuth: class {},
    MessageMedia: { fromFilePath: (ruta) => ({ imagen: ruta }) },
  },
  'qrcode-terminal': { generate() {} },
  qrcode: { toDataURL: async () => '' },
  dotenv: { config() {} },
};
const cargarOriginal = Module._load;
Module._load = function (pedido, ...resto) {
  if (Object.prototype.hasOwnProperty.call(falsos, pedido)) return falsos[pedido];
  return cargarOriginal.call(this, pedido, ...resto);
};

// ---- Captura de logs y de process.exit ----
const logs = [];
for (const nivel of ['log', 'warn', 'error']) {
  const original = console[nivel];
  console[nivel] = (...args) => { logs.push(args.join(' ')); if (process.env.VER_LOGS) original(...args); };
}
let codigoSalida = null;
process.exit = (codigo) => { codigoSalida = codigo; };

require('../src/whatsapp');
const { mensajes } = require('../src/mensajes');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const NUMERO = '5218111111111@c.us';
const mensaje = (type, body = '', from = NUMERO) => ({
  type, body, from, fromMe: false, getChat: () => Promise.resolve({ sendStateTyping: () => Promise.resolve() }),
});
const textosEnviados = () => enviados.map((e) => (typeof e.contenido === 'string' ? e.contenido : `[imagen] ${e.opciones.caption}`));

test('a un audio, foto o sticker le contesta que solo lee texto', async () => {
  enviados.length = 0;
  for (const tipo of ['ptt', 'image', 'sticker']) cliente.emit('message', mensaje(tipo));
  await esperar(50);
  assert.deepEqual(textosEnviados(), [mensajes.soloTexto, mensajes.soloTexto, mensajes.soloTexto]);
});

test('ignora grupos y estados', async () => {
  enviados.length = 0;
  cliente.emit('message', mensaje('chat', 'hola', '123@g.us'));
  cliente.emit('message', mensaje('chat', 'hola', 'status@broadcast'));
  await esperar(200);
  assert.equal(enviados.length, 0);
});

test('varios mensajes seguidos reciben UNA respuesta, en orden', async () => {
  enviados.length = 0;
  const otro = '5218122222222@c.us';
  cliente.emit('message', mensaje('chat', 'hola', otro));
  cliente.emit('message', mensaje('chat', 'estoy muy estresado', otro));
  cliente.emit('message', mensaje('chat', 'y también triste', otro));
  await esperar(400);
  const t = textosEnviados();
  assert.equal(t.filter((x) => x === mensajes.preguntaSeguimiento).length, 1, 'mandó más de un ejercicio');
  assert.equal(t[0], mensajes.bienvenida);
  assert.equal(t[t.length - 1], mensajes.preguntaSeguimiento);
});

test('los logs no guardan el número ni el texto del estudiante', async () => {
  logs.length = 0;
  cliente.emit('message', mensaje('chat', 'me siento muy solo últimamente', '5218133333333@c.us'));
  await esperar(300);
  const todo = logs.join('\n');
  assert.ok(logs.length > 0);
  assert.doesNotMatch(todo, /5218133333333/);
  assert.doesNotMatch(todo, /muy solo/);
});

test('si WhatsApp se desconecta, el bot se cierra con error para que pm2 lo reinicie', async () => {
  cliente.emit('disconnected', 'NAVIGATION');
  await esperar(50);
  assert.equal(codigoSalida, 1);
  assert.equal(cliente.destruido, true);
});
