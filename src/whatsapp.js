// Bot de WhatsApp (whatsapp-web.js). Al arrancar muestra un código QR:
// escanéalo desde WhatsApp > Dispositivos vinculados con el número del bot.

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { responder } = require('./conversacion');
const { mensajes } = require('./mensajes');
const { crearCola } = require('./cola');
const ollama = require('./ollama');

const PAUSA_ENTRE_MENSAJES_MS = Number(process.env.PAUSA_ENTRE_MENSAJES_MS || 700);
// Tiempo que se espera por si el estudiante manda varios mensajes seguidos (se contestan juntos).
const ESPERA_MENSAJES_MS = Number(process.env.ESPERA_MENSAJES_MS || 1500);
// Privacidad: por defecto NO se guarda el número ni el texto de los estudiantes en los logs.
// Solo para pruebas: LOG_MENSAJES=true en .env.
const LOG_MENSAJES = (process.env.LOG_MENSAJES || 'false').toLowerCase() === 'true';
// Cada cuánto se revisa que la sesión de WhatsApp siga conectada.
const REVISION_CONEXION_MS = 5 * 60 * 1000;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Tipos de mensaje que no son texto y a los que sí hay que contestar ("solo leo texto").
const TIPOS_NO_TEXTO = ['ptt', 'audio', 'image', 'video', 'sticker', 'document', 'location', 'vcard', 'multi_vcard'];

// Usa el Chrome/Edge ya instalado (CHROME_PATH en .env o se busca solo).
// Si no encuentra ninguno, usa el Chrome que descarga puppeteer.
function buscarNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidatos.find((ruta) => ruta && fs.existsSync(ruta));
}

// Identificador corto y anónimo del estudiante para los logs (no se puede regresar al número).
const SAL_LOG = crypto.randomBytes(8).toString('hex'); // cambia en cada arranque
function idAnonimo(numero) {
  return crypto.createHash('sha256').update(SAL_LOG + numero).digest('hex').slice(0, 8);
}

// La sesión de WhatsApp se guarda en una ruta corta: en Windows, si la ruta
// del perfil del navegador es muy larga, WhatsApp Web se recarga y el bot truena.
const CARPETA_SESION = process.env.SESION_PATH || path.join(os.homedir(), '.botiquin-bot');

// Opcional: vincular con un código de 8 letras en vez del QR (NUMERO_BOT en .env).
const NUMERO_BOT = (process.env.NUMERO_BOT || '').replace(/\D/g, '');

// En muchas terminales el QR de texto sale deformado y el celular no lo lee,
// así que también se guarda como página (qr.html) que se recarga sola.
const ARCHIVO_QR = path.join(__dirname, '..', 'qr.html');
let qrAbierto = false;

function paginaQR(contenido) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<title>QR del bot</title></head>
<body style="font-family:sans-serif;text-align:center;padding:24px">${contenido}</body></html>`;
}

async function guardarQR(qr) {
  const imagen = await QRCode.toDataURL(qr, { width: 360, margin: 2 });
  fs.writeFileSync(ARCHIVO_QR, paginaQR(`<h2>Escanea con WhatsApp</h2>
<p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>
<img src="${imagen}" alt="QR"><p>El código cambia cada ~20 s; esta página se actualiza sola.</p>`));
  if (!qrAbierto && process.platform === 'win32') {
    exec(`start "" "${ARCHIVO_QR}"`);
    qrAbierto = true;
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: CARPETA_SESION }),
  puppeteer: {
    executablePath: buscarNavegador(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  ...(NUMERO_BOT && { pairWithPhoneNumber: { phoneNumber: NUMERO_BOT, showNotification: true } }),
});

// Si el bot se queda sin conexión, se cierra con error para que pm2 lo vuelva a arrancar.
// Antes solo escribía un aviso y se quedaba "vivo" pero sin contestar.
let cerrando = false;
async function cerrarParaReiniciar(motivo) {
  if (cerrando) return;
  cerrando = true;
  console.error(`⚠️ ${motivo}. Cerrando el bot para que pm2 lo reinicie...`);
  try {
    await Promise.race([client.destroy(), esperar(10000)]);
  } catch (_) {
    // si no se puede cerrar el navegador, igual se sale
  }
  process.exit(1);
}

client.on('qr', (qr) => {
  if (NUMERO_BOT) return;
  console.log('Escanea este código QR con WhatsApp (Dispositivos vinculados):');
  qrcode.generate(qr, { small: true });
  console.log(`Si no se lee, abre ${ARCHIVO_QR}`);
  guardarQR(qr).catch((err) => console.warn('[qr] no se pudo guardar:', err.message));
});

client.on('code', (codigo) => {
  console.log(`🔑 Código para vincular: ${codigo}`);
  console.log('En el celular del bot: WhatsApp → Dispositivos vinculados → Vincular un dispositivo →');
  console.log('"Vincular con el número de teléfono" y escribe el código.');
});

let conectado = false;
client.on('ready', () => {
  conectado = true;
  if (fs.existsSync(ARCHIVO_QR)) {
    fs.writeFileSync(ARCHIVO_QR, paginaQR('<h2>✅ Bot conectado a WhatsApp</h2><p>Ya puedes cerrar esta página.</p>'));
  }
  console.log('✅ Bot del Botiquín para la calma conectado a WhatsApp.');
  console.log(ollama.OLLAMA_ACTIVO ? `🤖 IA local: Ollama (${ollama.OLLAMA_MODEL})` : '🤖 IA local desactivada (solo menú)');
});

client.on('auth_failure', (msg) => cerrarParaReiniciar(`Error de autenticación (${msg})`));
client.on('disconnected', (razon) => cerrarParaReiniciar(`WhatsApp desconectado (${razon})`));

// Revisión periódica: si WhatsApp Web deja de estar conectado dos veces seguidas, se reinicia.
let fallosSeguidos = 0;
setInterval(async () => {
  if (!conectado || cerrando) return;
  try {
    const estado = await Promise.race([client.getState(), esperar(30000).then(() => 'SIN_RESPUESTA')]);
    fallosSeguidos = estado === 'CONNECTED' ? 0 : fallosSeguidos + 1;
    if (fallosSeguidos > 0) console.warn(`[conexión] estado: ${estado}`);
  } catch (err) {
    fallosSeguidos += 1;
    console.warn(`[conexión] no se pudo revisar (${err.message})`);
  }
  if (fallosSeguidos >= 2) cerrarParaReiniciar('La sesión de WhatsApp dejó de responder');
}, REVISION_CONEXION_MS).unref();

// Con el WhatsApp Web actual, whatsapp-web.js 1.34.7 sí envía el mensaje pero después
// truena al buscarlo (el id ya no trae _serialized). Ese error se ignora para seguir
// mandando el resto de la respuesta. sendSeen: false porque marcar como visto también falla.
async function enviar(destino, contenido, opciones = {}) {
  try {
    await client.sendMessage(destino, contenido, { sendSeen: false, ...opciones });
  } catch (err) {
    if (!String(err.message).includes('must include an id property')) throw err;
  }
}

// Contesta los mensajes que la cola ya juntó y ordenó.
async function contestar(destino, texto) {
  const respuestas = await responder(destino, texto);
  for (const r of respuestas) {
    if (r.tipo === 'imagen') {
      await enviar(destino, MessageMedia.fromFilePath(r.archivo), { caption: r.texto });
    } else {
      await enviar(destino, r.texto);
    }
    await esperar(PAUSA_ENTRE_MENSAJES_MS);
  }
}

const cola = crearCola(contestar, { esperaMs: ESPERA_MENSAJES_MS });

client.on('message', async (msg) => {
  // Solo chats individuales: ignora grupos, estados y mensajes propios.
  if (msg.fromMe || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;

  // Audios, fotos, stickers, etc.: antes se ignoraban sin contestar.
  if (TIPOS_NO_TEXTO.includes(msg.type)) {
    console.log(`📎 [${idAnonimo(msg.from)}] mandó ${msg.type}: se le pide escribir`);
    enviar(msg.from, mensajes.soloTexto).catch((err) => console.error('Error al responder:', err.message));
    return;
  }
  if (msg.type !== 'chat') return; // otros eventos (reacciones, avisos del sistema)

  if (LOG_MENSAJES) console.log(`📩 ${msg.from}: ${msg.body}`);
  else console.log(`📩 [${idAnonimo(msg.from)}] mensaje recibido (${msg.body.length} caracteres)`);

  // "Escribiendo..." es opcional: con algunas versiones de WhatsApp Web getChat() falla
  // y no debe impedir que el bot conteste.
  msg.getChat().then((chat) => chat.sendStateTyping()).catch(() => {});

  cola.recibir(msg.from, msg.body);
});

process.on('unhandledRejection', (err) => console.error('[error sin manejar]', err && err.message ? err.message : err));

ollama.precalentar();
client.initialize().catch((err) => {
  console.error('❌ No se pudo iniciar WhatsApp:', err.message || err);
  process.exit(1);
});
