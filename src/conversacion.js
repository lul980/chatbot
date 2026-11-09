// Lógica de la conversación estándar.
// No depende de WhatsApp: recibe un texto y regresa la lista de respuestas,
// así se puede probar en consola (src/consola.js) o conectar a otro canal.
//
// Flujo:
//   saludo -> menú (6 cartas) -> ejercicio -> "¿cómo te sientes?" -> mejor / igual / peor
//   En cualquier momento: "menú", "otro", despedida, y detección de crisis.

const fs = require('fs'); // permite revisar si un archivo existe (la foto del Wellness Center)
const path = require('path'); // sirve para armar rutas de carpetas y archivos
const { botiquin } = require('./botiquin'); // trae el contenido de las 6 cartas
const { mensajes } = require('./mensajes'); // trae los textos del bot
const ollama = require('./ollama'); // trae la conexión con la IA local

const CARPETA_IMAGENES = path.join(__dirname, '..', 'assets', 'cartas'); // carpeta de las imágenes de las cartas
const MINUTOS_SESION = 30; // minutos sin escribir para que la sesión se reinicie

// ============ UBICACIÓN DEL WELLNESS CENTER ============
// PARA QUÉ SIRVE: cuando el estudiante pregunta dónde está el Wellness Center,
// el bot manda una foto de la fachada y el enlace de Google Maps.
// ⚠️ FALTA COMPLETAR (mientras falte, el bot avisa que está actualizando la ubicación):
//   1) La foto: guárdala como assets/lugares/wellness-center.jpg (crea la carpeta "lugares").
//   2) El enlace: pégalo entre las comillas de mapsUrl.
const WELLNESS = { // datos del Wellness Center que se mandan al estudiante
  imagen: path.join(__dirname, '..', 'assets', 'lugares', 'wellness-center.jpg'), // ruta de la foto de la fachada (PENDIENTE: el archivo aún no existe)
  mapsUrl: '', // enlace de Google Maps (PENDIENTE: pegarlo entre las comillas)
}; // fin de los datos del Wellness Center
const NOMBRES_WELLNESS = ['wellness', 'centro de bienestar']; // formas en que el estudiante puede nombrar el lugar
const PREGUNTAS_UBICACION = ['donde', 'ubic', 'queda', 'direccion', 'como llego', 'como llegar', 'mapa']; // palabras que indican que pregunta por la ubicación

const PALABRAS_CRISIS = [ // palabras que activan el mensaje de crisis
  'suicid', 'matarme', 'quitarme la vida', 'morirme', 'quiero morir', 'no quiero vivir', // palabras de riesgo (parte 1)
  'hacerme dano', 'lastimarme', 'cortarme', 'no vale la pena vivir', 'desaparecer para siempre', // palabras de riesgo (parte 2)
]; // fin de la lista de crisis
const SALUDOS = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'inicio', 'empezar']; // formas de saludar
const MENU = ['menu', 'volver', 'regresar']; // palabras para volver al menú
const DESPEDIDAS = ['adios', 'bye', 'chao', 'hasta luego', 'nos vemos', 'salir']; // formas de despedirse
const OTRO = ['otro', 'otra', 'otro ejercicio', 'siguiente']; // formas de pedir otro ejercicio

// Sesiones en memoria: { estado, categoriaId, vistos, ultimaActividad }
const sesiones = new Map(); // guarda la conversación de cada usuario

function normalizar(texto) { // limpia el texto para poder compararlo
  return (texto || '') // si no hay texto, usa un texto vacío
    .toLowerCase() // pasa todo a minúsculas
    .normalize('NFD') // separa las letras de sus acentos
    .replace(/[\u0300-\u036f]/g, '') // quita los acentos
    .replace(/[¡!¿?.,]/g, '') // quita los signos de puntuación
    .trim(); // quita espacios al inicio y al final
} // fin de normalizar

function contiene(texto, lista) { // revisa si el texto trae alguna palabra de la lista
  const palabras = texto.split(/\s+/); // separa el texto en palabras
  return lista.some((clave) => // revisa cada palabra clave
    clave.includes(' ') ? texto.includes(clave) : palabras.some((p) => p.startsWith(clave)), // frases: busca dentro; palabras: busca al inicio
  ); // fin de la revisión
} // fin de contiene

function esExacto(texto, lista) { // revisa si el texto es exactamente una de las palabras
  return lista.includes(texto); // true si está en la lista
} // fin de esExacto

function obtenerSesion(usuario) { // busca o crea la sesión del usuario
  const ahora = Date.now(); // hora actual en milisegundos
  let sesion = sesiones.get(usuario); // busca la sesión guardada
  const expirada = sesion && ahora - sesion.ultimaActividad > MINUTOS_SESION * 60 * 1000; // revisa si ya pasó el tiempo límite
  const nueva = !sesion || expirada; // es nueva si no existía o ya expiró
  if (nueva) { // si es nueva
    sesion = { estado: 'menu', categoriaId: null, vistos: new Set() }; // crea una sesión limpia
    sesiones.set(usuario, sesion); // la guarda
  } // fin del if
  sesion.ultimaActividad = ahora; // anota la hora de este mensaje
  return { sesion, nueva }; // regresa la sesión y si es nueva
} // fin de obtenerSesion

function texto(t) { // crea una respuesta de texto
  return { tipo: 'texto', texto: t }; // formato que entiende whatsapp.js
} // fin de texto

function formatearEjercicio(ej) { // arma el mensaje de un ejercicio
  let t = `*${ej.titulo}*\n\n${ej.pasos.join('\n')}`; // título en negritas y luego los pasos
  if (ej.cierre) t += `\n\n_${ej.cierre}_`; // agrega la frase de cierre si existe
  return t; // regresa el mensaje listo
} // fin de formatearEjercicio

function respuestasWellness() { // arma las respuestas sobre la ubicación del Wellness Center
  const respuestas = []; // lista de mensajes que se mandarán
  const hayFoto = fs.existsSync(WELLNESS.imagen); // revisa si ya guardaste la foto
  const hayMapa = WELLNESS.mapsUrl.trim() !== ''; // revisa si ya pegaste el enlace de Google Maps
  if (!hayFoto && !hayMapa) { // si todavía no hay ni foto ni enlace
    respuestas.push(texto(mensajes.wellnessPendiente)); // avisa que se está actualizando la ubicación
    return respuestas; // termina aquí
  } // fin del if
  if (hayFoto) { // si la foto existe
    respuestas.push({ tipo: 'imagen', archivo: WELLNESS.imagen, texto: mensajes.wellnessFoto }); // manda la foto de la fachada con su texto
  } // fin del if
  if (hayMapa) { // si el enlace existe
    respuestas.push(texto(mensajes.wellnessMapa.replace('{enlace}', WELLNESS.mapsUrl))); // manda el enlace de Google Maps
  } // fin del if
  respuestas.push(texto(mensajes.wellnessCierre)); // cierra invitando a escribir menú
  return respuestas; // regresa los mensajes
} // fin de respuestasWellness

function detectarCategoria(t) { // busca qué carta eligió el estudiante
  const numero = t.match(/^([1-6])(\D|$)/); // revisa si empieza con un número del 1 al 6
  if (numero) return botiquin.find((c) => c.numero === Number(numero[1])); // si hay número, regresa esa carta
  return botiquin.find((c) => contiene(t, c.palabrasClave)) || null; // si no, busca por palabras clave
} // fin de detectarCategoria

function enviarEjercicio(sesion, categoria) { // arma la respuesta con un ejercicio de la carta
  const respuestas = []; // lista de mensajes que se mandarán
  const cambioDeCarta = sesion.categoriaId !== categoria.id; // revisa si es una carta distinta a la anterior
  if (cambioDeCarta) { // si cambió de carta
    sesion.categoriaId = categoria.id; // guarda la carta actual
    sesion.vistos = new Set(); // reinicia los ejercicios vistos
    respuestas.push({ // agrega la imagen de la carta
      tipo: 'imagen', // indica que es una imagen
      archivo: path.join(CARPETA_IMAGENES, categoria.imagen), // ruta de la imagen
      texto: mensajes.introEjercicio.replace('{titulo}', categoria.titulo), // texto que acompaña la imagen
    }); // fin de la imagen
  } // fin del if

  const pendientes = categoria.ejercicios.map((_, i) => i).filter((i) => !sesion.vistos.has(i)); // ejercicios que aún no ha visto
  if (pendientes.length === 0) { // si ya vio todos
    sesion.estado = 'menu'; // vuelve al menú
    respuestas.push(texto(mensajes.sinMasEjercicios)); // avisa que ya no hay más
    return respuestas; // termina aquí
  } // fin del if

  const indice = pendientes[Math.floor(Math.random() * pendientes.length)]; // elige un ejercicio al azar
  sesion.vistos.add(indice); // lo marca como visto
  sesion.estado = 'ejercicio'; // ahora la conversación está en un ejercicio
  respuestas.push(texto(formatearEjercicio(categoria.ejercicios[indice]))); // agrega el ejercicio
  respuestas.push(texto(mensajes.preguntaSeguimiento)); // agrega la pregunta "¿cómo te sientes ahora?"
  return respuestas; // regresa los mensajes
} // fin de enviarEjercicio

async function responder(usuario, mensaje) { // función principal: recibe el mensaje y regresa las respuestas
  const t = normalizar(mensaje); // limpia el mensaje
  const { sesion, nueva } = obtenerSesion(usuario); // obtiene la sesión del usuario

  // 1. Seguridad primero: palabras de riesgo.
  if (contiene(t, PALABRAS_CRISIS)) { // si detecta palabras de riesgo
    sesion.estado = 'menu'; // vuelve al menú
    return [texto(mensajes.crisis)]; // manda el mensaje de crisis
  } // fin del if

  // 1b. Pregunta por la ubicación del Wellness Center.
  if (contiene(t, NOMBRES_WELLNESS) && contiene(t, PREGUNTAS_UBICACION)) { // nombra el lugar y pregunta dónde está
    return respuestasWellness(); // manda la foto y el mapa sin cambiar el estado de la conversación
  } // fin del if

  const inicio = nueva ? [texto(mensajes.bienvenida)] : []; // si es sesión nueva, agrega la bienvenida

  // 2. Comandos generales.
  if (esExacto(t, MENU)) { // si escribe "menú"
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [...inicio, texto(mensajes.menu)]; // manda el menú
  } // fin del if
  if (contiene(t, DESPEDIDAS)) { // si se despide
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [texto(mensajes.despedida)]; // manda la despedida
  } // fin del if

  // 3. Seguimiento después de un ejercicio.
  if (sesion.estado === 'ejercicio' && !nueva) { // si estaba en un ejercicio
    const categoria = botiquin.find((c) => c.id === sesion.categoriaId); // busca la carta actual
    if (t.startsWith('1') || t.includes('mejor')) { // si dice que está mejor
      sesion.estado = 'menu'; // vuelve al menú
      return [texto(mensajes.respuestaMejor)]; // manda el cierre positivo
    } // fin del if
    if (t.startsWith('2') || t.includes('igual')) { // si dice que está igual
      return [texto(mensajes.respuestaIgual), ...enviarEjercicio(sesion, categoria)]; // manda otro ejercicio
    } // fin del if
    if (t.startsWith('3') || t.includes('peor')) { // si dice que está peor
      return [texto(mensajes.respuestaPeor)]; // manda el número de atención
    } // fin del if
    if (esExacto(t, OTRO)) { // si pide otro ejercicio
      return enviarEjercicio(sesion, categoria); // manda otro ejercicio
    } // fin del if
    // Si escribe otra cosa, se interpreta como un estado de ánimo nuevo (abajo).
  } // fin del if

  // 4. Elegir carta: número, palabras clave o IA local.
  let categoria = detectarCategoria(t); // intenta detectar la carta
  if (!categoria && (t === '' || contiene(t, SALUDOS))) { // si no hay carta y es un saludo
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [...inicio, texto(mensajes.menu)]; // manda el menú
  } // fin del if

  let empatia = null; // aquí se guarda la frase empática de la IA
  if (!categoria) { // si todavía no hay carta
    const ia = await ollama.interpretar(mensaje); // le pregunta a la IA local
    if (ia) { // si la IA respondió
      empatia = ia.respuesta || null; // guarda su frase empática
      if (ia.categoria) categoria = botiquin.find((c) => c.id === ia.categoria); // usa la carta que eligió la IA
    } // fin del if
  } // fin del if

  if (categoria) { // si ya hay carta
    return [...inicio, ...(empatia ? [texto(empatia)] : []), ...enviarEjercicio(sesion, categoria)]; // manda bienvenida, frase empática y ejercicio
  } // fin del if

  sesion.estado = 'menu'; // si no entendió, vuelve al menú
  return [...inicio, texto(empatia || mensajes.noEntendi), texto(mensajes.menu)]; // manda "no entendí" y el menú
} // fin de responder

module.exports = { responder, normalizar }; // exporta las funciones para usarlas en otros archivos
