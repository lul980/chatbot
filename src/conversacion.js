// Lógica de la conversación estándar.
// No depende de WhatsApp: recibe un texto y regresa la lista de respuestas,
// así se puede probar en consola (src/consola.js), con pruebas (npm test) o conectar a otro canal.
//
// Flujo:
//   saludo -> menú (6 cartas) -> ejercicio -> "¿cómo te sientes?" -> mejor / igual / peor
//   En cualquier momento: "menú", "otro", despedida, ubicación del Wellness Center y detección de crisis.

const fs = require('fs'); // permite revisar si un archivo existe (la foto del Wellness Center)
const path = require('path'); // sirve para armar rutas de carpetas y archivos
const { botiquin } = require('./botiquin'); // trae el contenido de las 6 cartas
const { mensajes } = require('./mensajes'); // trae los textos del bot
const ollama = require('./ollama'); // trae la conexión con la IA local

const CARPETA_IMAGENES = path.join(__dirname, '..', 'assets', 'cartas'); // carpeta de las imágenes de las cartas
const MINUTOS_SESION = 30; // minutos sin escribir para que la sesión se reinicie
const PALABRAS_MINIMAS_IA = 3; // mensajes libres de 3 palabras o más también pasan por la IA (para detectar riesgo)

// ============ UBICACIÓN DEL WELLNESS CENTER ============
// PARA QUÉ SIRVE: cuando el estudiante pregunta dónde está el Wellness Center / Bienestar Estudiantil,
// el bot manda una foto de la fachada y el enlace de Google Maps.
// ⚠️ FALTA COMPLETAR (mientras falte, el bot avisa que está actualizando la ubicación):
//   1) La foto: guárdala como assets/lugares/wellness-center.jpg
//   2) El enlace: ponlo en .env como WELLNESS_MAPS_URL=... (o pégalo entre las comillas de mapsUrl).
const WELLNESS = { // datos del Wellness Center que se mandan al estudiante
  imagen: path.join(__dirname, '..', 'assets', 'lugares', 'wellness-center.jpg'), // ruta de la foto de la fachada (PENDIENTE: el archivo aún no existe)
  mapsUrl: process.env.WELLNESS_MAPS_URL || '', // enlace de Google Maps (PENDIENTE)
}; // fin de los datos del Wellness Center
const NOMBRES_WELLNESS = [ // formas en que el estudiante puede nombrar el lugar
  'wellness', 'centro de bienestar', 'bienestar estudiantil', 'oficina de bienestar', 'area de bienestar', 'life',
]; // fin de los nombres
const PREGUNTAS_UBICACION = ['donde', 'ubic', 'queda', 'direccion', 'como llego', 'como llegar', 'mapa']; // palabras que indican que pregunta por la ubicación

// ============ DETECCIÓN DE CRISIS ============
// Se revisa ANTES que todo lo demás. Si se agrega una frase, va sin acentos y en minúsculas.
// Además de esta lista, la IA tiene la categoría "riesgo" (ver src/ollama.js) para lo que la lista no cubra.
const PALABRAS_CRISIS = [ // palabras y frases que activan el mensaje de crisis
  // ideas de suicidio o de morir
  'suicid', 'matarme', 'morirme', 'quitarme la vida', 'quiero morir', 'me quiero matar', 'me voy a matar', // parte 1
  'voy a matarme', 'acabar con mi vida', 'terminar con mi vida', 'acabar con todo', 'no quiero vivir', // parte 2
  'no quiero seguir viviendo', 'no quiero seguir con vida', 'no vale la pena vivir', 'estar muerto', 'estar muerta', // parte 3
  'mejor muerto', 'mejor muerta', 'no existiera', 'dejar de existir', 'no quiero existir', 'quiero desaparecer', // parte 4
  'desaparecer para siempre', 'no quiero despertar', 'ya no quiero estar aqui', 'mejor sin mi', // parte 5
  'sentido a la vida', 'sentido a mi vida', 'la vida no tiene sentido', 'sentido a nada', 'nada tiene sentido', // parte 6
  'soy una carga', 'ser una carga', 'ya no aguanto', 'no tengo salida', 'no le veo salida', // parte 6b (frases que la IA no detectó siempre)
  'que esto se acabe', 'que todo se acabe', 'que esto termine', 'que todo termine', 'acabar con esto', // parte 6c
  'colgarme', 'ahorcarme', 'envenenarme', // parte 7
  // hacerse daño
  'lastimarme', 'me lastimo', 'me quiero lastimar', 'cortarme', 'me corto', 'me he cortado', // parte 8
  'hacerme dano', 'me quiero hacer dano', 'me hago dano', 'autolesion', // parte 9
]; // fin de la lista de crisis
const EXCEPCIONES_CRISIS = [ // frases inofensivas que contienen palabras de la lista (se quitan antes de revisar)
  'me quiero morir de risa', 'quiero morir de risa', 'morirme de risa', // risa
  'cortarme el pelo', 'cortarme el cabello', 'cortarme el fleco', 'cortarme las unas', // cortes de pelo y uñas
  'me corto el pelo', 'me corto el cabello', 'me corto las unas', 'me he cortado el pelo', 'me he cortado el cabello', // cortes de pelo y uñas
]; // fin de las excepciones

const SALUDOS = ['hola', 'holi', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'inicio', 'empezar']; // formas de saludar
const MENU = ['menu', 'volver', 'regresar', 'inicio', 'volver al menu', 'regresar al menu', 'ir al menu', 'ver menu', 'el menu']; // frases exactas para volver al menú
const DESPEDIDAS_EXACTAS = ['salir', 'adios', 'bye', 'chao', 'gracias adios', 'ok adios']; // despedidas que deben venir solas
const DESPEDIDAS = ['adios', 'bye', 'chao', 'hasta luego', 'nos vemos', 'hasta pronto']; // despedidas dentro de un mensaje corto
const OTRO = [ // frases exactas para pedir otro ejercicio
  'otro', 'otra', 'otro ejercicio', 'otra opcion', 'siguiente', 'dame otro', 'quiero otro', // parte 1
  'otro porfa', 'otro por favor', 'otro ejercicio por favor', 'otro ejercicio porfa', 'uno mas', 'otro mas', // parte 2
]; // fin de la lista
const PALABRAS_PREGUNTA = ['cuando', 'donde', 'que hora', 'a que hora', 'cual', 'cuanto', 'quien', 'como se', 'como le hago para']; // inicios típicos de preguntas

// Frases que niegan el estado de ánimo justo antes de la palabra clave: "no estoy estresado", "no me siento solo".
const NEGACION = /(?:^|\s)no\s+(?:estoy|me\s+siento|ando|me\s+encuentro|siento|soy|me\s+pongo)(?:\s+(?:tan|muy|nada|para\s+nada))?\s*$/; // expresión regular de negación
const NEGACION_CORTA = /(?:^|\s)no\s*$/; // "no" justo antes (solo para frases que empiezan con "me siento" o "estoy")

// Sesiones en memoria: { estado, categoriaId, vistos, ultimaActividad }
const sesiones = new Map(); // guarda la conversación de cada usuario

// Cada 10 minutos borra las sesiones viejas para que la memoria no crezca sin límite.
setInterval(() => { // tarea periódica
  const limite = Date.now() - MINUTOS_SESION * 60 * 1000; // hora antes de la cual una sesión ya expiró
  for (const [usuario, sesion] of sesiones) { // revisa cada sesión
    if (sesion.ultimaActividad < limite) sesiones.delete(usuario); // borra las expiradas
  } // fin del for
}, 10 * 60 * 1000).unref(); // unref: no impide que el programa termine

function normalizar(texto) { // limpia el texto para poder compararlo
  return (texto || '') // si no hay texto, usa un texto vacío
    .toLowerCase() // pasa todo a minúsculas
    .normalize('NFD') // separa las letras de sus acentos
    .replace(/[̀-ͯ]/g, '') // quita los acentos (la ñ queda como n)
    .replace(/[¡!¿?.,;:()"'*_~]/g, ' ') // cambia los signos de puntuación por espacios
    .replace(/[ \t]+/g, ' ') // junta espacios repetidos
    .replace(/ *\n */g, '\n') // quita espacios alrededor de los saltos de línea
    .trim(); // quita espacios al inicio y al final
} // fin de normalizar

function palabrasDe(texto) { // separa el texto en palabras
  return texto.split(/\s+/).filter(Boolean); // separa por espacios y saltos de línea, sin vacíos
} // fin de palabrasDe

function contiene(texto, lista) { // revisa si el texto trae alguna palabra de la lista
  const plano = texto.replace(/\n/g, ' '); // trata los saltos de línea como espacios
  const palabras = palabrasDe(plano); // separa el texto en palabras
  return lista.some((clave) => // revisa cada palabra clave
    clave.includes(' ') ? plano.includes(clave) : palabras.some((p) => p.startsWith(clave)), // frases: busca dentro; palabras: busca al inicio
  ); // fin de la revisión
} // fin de contiene

function esExacto(texto, lista) { // revisa si el texto es exactamente una de las frases
  return lista.includes(texto.replace(/\n/g, ' ')); // true si está en la lista
} // fin de esExacto

function ultimaLinea(texto) { // regresa el último renglón (cuando se juntan varios mensajes seguidos)
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean); // separa en renglones
  return lineas[lineas.length - 1] || ''; // regresa el último o vacío
} // fin de ultimaLinea

function esCrisis(t) { // revisa si el mensaje trae palabras de riesgo
  let limpio = t.replace(/\n/g, ' '); // une los renglones
  for (const excepcion of EXCEPCIONES_CRISIS) limpio = limpio.split(excepcion).join(' '); // quita las frases inofensivas
  return contiene(limpio, PALABRAS_CRISIS); // true si queda alguna palabra de riesgo
} // fin de esCrisis

function esPregunta(original, t) { // revisa si el mensaje es una pregunta
  if (/[¿?]/.test(original || '')) return true; // tiene signos de interrogación
  return PALABRAS_PREGUNTA.some((p) => t.startsWith(`${p} `)); // empieza como pregunta
} // fin de esPregunta

function numeroDeMenu(texto, maximo) { // regresa el número si el mensaje es SOLO un número del menú ("3", "3️⃣", "opción 3")
  const m = texto.match(/^(?:opcion|la|el|numero|carta)?\s*([1-9])️?⃣?$/); // número solo, con emoji de tecla o "opción"
  if (!m) return null; // no es un número solo
  const numero = Number(m[1]); // convierte a número
  return numero >= 1 && numero <= maximo ? numero : null; // solo si está en el rango
} // fin de numeroDeMenu

function indicePalabra(texto, clave, desde) { // busca dónde empieza una palabra que inicia con la clave
  const re = new RegExp(`(?:^|\\s)${clave}`, 'g'); // la clave al inicio de una palabra
  re.lastIndex = desde; // empieza a buscar desde esta posición
  const m = re.exec(texto); // busca
  return m ? m.index + m[0].length - clave.length : -1; // posición de la clave o -1
} // fin de indicePalabra

function posicionSinNegar(texto, clave) { // posición de la clave cuando NO está negada ("no estoy estresado"), o -1
  const esFrase = clave.includes(' '); // las frases se buscan tal cual
  const puedeNegarseCorto = /^(me siento|estoy) /.test(clave); // "no me siento solo": el "no" va pegado a la frase
  let desde = 0; // posición desde donde se busca
  for (;;) { // revisa cada aparición de la clave
    const i = esFrase ? texto.indexOf(clave, desde) : indicePalabra(texto, clave, desde); // busca la siguiente
    if (i === -1) return -1; // ya no aparece
    const antes = texto.slice(0, i); // texto antes de la clave
    const negada = NEGACION.test(antes) || (puedeNegarseCorto && NEGACION_CORTA.test(antes)); // revisa si está negada
    if (!negada) return i; // encontró una aparición sin negar
    desde = i + 1; // sigue buscando más adelante
  } // fin del for
} // fin de posicionSinNegar

function detectarCategoria(t, pregunta) { // busca qué carta eligió el estudiante
  const numero = numeroDeMenu(t, botiquin.length) || numeroDeMenu(ultimaLinea(t), botiquin.length); // número solo (o en el último renglón)
  if (numero) return botiquin.find((c) => c.numero === numero); // si hay número, regresa esa carta

  const plano = t.replace(/\n/g, ' '); // une los renglones
  let mejor = null; // carta encontrada más temprano en el mensaje
  let mejorPos = Infinity; // posición de esa carta
  for (const carta of botiquin) { // revisa cada carta
    const claves = [...carta.palabrasClave, ...(pregunta ? [] : carta.palabrasContexto || [])]; // las de contexto no cuentan en preguntas
    for (const clave of claves) { // revisa cada palabra clave
      const pos = posicionSinNegar(plano, clave); // dónde aparece sin negar
      if (pos !== -1 && pos < mejorPos) { // si aparece antes que la mejor hasta ahora
        mejor = carta; // la guarda
        mejorPos = pos; // y su posición
      } // fin del if
    } // fin del for de claves
  } // fin del for de cartas
  return mejor; // regresa la carta o null
} // fin de detectarCategoria

// Interpreta la respuesta a "¿Cómo te sientes ahora?". Regresa 'mejor', 'igual', 'peor' o null.
function interpretarSeguimiento(t) { // revisa la respuesta del estudiante
  const corto = ultimaLinea(t); // el último renglón manda
  const numero = numeroDeMenu(corto, 3); // "1", "2" o "3" solos
  if (numero) return ['mejor', 'igual', 'peor'][numero - 1]; // convierte el número en respuesta
  const plano = t.replace(/\n/g, ' '); // une los renglones
  if (/\bni mejor ni peor\b|\bigual\b|\blo mismo\b|\bmas o menos\b|\bmasomenos\b|\bregular\b/.test(plano)) return 'igual'; // sin cambio
  const negado = (palabra) => new RegExp(`\\b(?:no|nada|tampoco)\\s+(?:\\S+\\s+){0,2}${palabra}\\b`).test(plano); // "no me siento mejor"
  if (/\bpeor\b|\bfatal\b|\bmas mal\b/.test(plano) && !negado('peor')) return 'peor'; // peor
  if (/\bmejor\b/.test(plano)) return negado('mejor') ? 'igual' : 'mejor'; // "mejor" o "no me siento mejor"
  if (/\bbien\b/.test(plano)) return negado('bien') ? 'peor' : 'mejor'; // "bien" o "no estoy bien"
  if (/\bmal\b/.test(plano)) return negado('mal') ? 'igual' : 'peor'; // "mal" o "no tan mal"
  return null; // no es una respuesta al seguimiento
} // fin de interpretarSeguimiento

function esMenu(t) { // revisa si pide volver al menú
  const plano = t.replace(/\n/g, ' '); // une los renglones
  return esExacto(plano, MENU) || (palabrasDe(plano).length <= 4 && contiene(plano, ['menu'])); // "menú" solo o "menú por favor"
} // fin de esMenu

function esDespedida(t) { // revisa si se está despidiendo
  const plano = t.replace(/\n/g, ' '); // une los renglones
  if (esExacto(plano, DESPEDIDAS_EXACTAS)) return true; // "salir", "adiós"...
  return palabrasDe(plano).length <= 4 && contiene(plano, DESPEDIDAS); // "ok gracias, nos vemos" (mensaje corto)
} // fin de esDespedida

// Palabras de cortesía que pueden acompañar a un saludo sin decir cómo se siente el estudiante.
const RELLENO_SALUDO = new Set(['hola', 'holi', 'holis', 'buenas', 'buenos', 'buen', 'dia', 'dias', 'tardes', 'noches', 'hey', 'oye',
  'que', 'tal', 'como', 'estas', 'esta', 'bot', 'amigo', 'amiga', 'inicio', 'empezar', 'quiero', 'gracias', 'ok', 'va']); // fin del relleno

function esSoloSaludo(t) { // revisa si el mensaje es solo un saludo ("hola", "buenas tardes, ¿cómo estás?")
  const plano = t.replace(/\n/g, ' '); // une los renglones
  if (plano === '') return true; // mensaje vacío: se trata como saludo
  const resto = palabrasDe(plano).filter((p) => !RELLENO_SALUDO.has(p)); // quita las palabras de cortesía
  return contiene(plano, SALUDOS) && resto.length === 0; // es saludo si no queda nada más ("hola, me siento fatal" no lo es)
} // fin de esSoloSaludo

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
  const hayMapa = WELLNESS.mapsUrl.trim() !== ''; // revisa si ya pusiste el enlace de Google Maps
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

function quedanEjercicios(sesion, categoria) { // revisa si quedan ejercicios sin ver en la carta
  return categoria.ejercicios.some((_, i) => !sesion.vistos.has(i)); // true si falta alguno
} // fin de quedanEjercicios

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

function respuestaCrisis(sesion) { // arma el mensaje de crisis
  sesion.estado = 'menu'; // vuelve al menú
  return [texto(mensajes.crisis)]; // manda el mensaje de crisis
} // fin de respuestaCrisis

async function responder(usuario, mensaje) { // función principal: recibe el mensaje y regresa las respuestas
  const t = normalizar(mensaje); // limpia el mensaje
  const { sesion, nueva } = obtenerSesion(usuario); // obtiene la sesión del usuario

  // 1. Seguridad primero: palabras de riesgo.
  if (esCrisis(t)) return respuestaCrisis(sesion); // si detecta palabras de riesgo, manda el mensaje de crisis

  // 1b. Pregunta por la ubicación del Wellness Center / Bienestar Estudiantil.
  if (contiene(t, NOMBRES_WELLNESS) && contiene(t, PREGUNTAS_UBICACION)) { // nombra el lugar y pregunta dónde está
    return respuestasWellness(); // manda la foto y el mapa sin cambiar el estado de la conversación
  } // fin del if

  const inicio = nueva ? [texto(mensajes.bienvenida)] : []; // si es sesión nueva, agrega la bienvenida

  // 2. Comandos generales.
  if (esMenu(t)) { // si escribe "menú" (o "menú por favor")
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [...inicio, texto(mensajes.menu)]; // manda el menú
  } // fin del if
  if (esDespedida(t)) { // si se despide (solo despedidas cortas: "salir con amigos" ya no cuenta)
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [texto(mensajes.despedida)]; // manda la despedida
  } // fin del if
  if (esExacto(t, OTRO)) { // si pide otro ejercicio (también después de "mejor")
    const categoria = botiquin.find((c) => c.id === sesion.categoriaId); // busca la carta actual
    if (!categoria) return [...inicio, texto(mensajes.otroSinCarta), texto(mensajes.menu)]; // si no hay carta, pide elegir una
    return enviarEjercicio(sesion, categoria); // manda otro ejercicio
  } // fin del if

  // 3. Seguimiento después de un ejercicio.
  if (sesion.estado === 'ejercicio' && !nueva) { // si estaba en un ejercicio
    const categoria = botiquin.find((c) => c.id === sesion.categoriaId); // busca la carta actual
    const seguimiento = interpretarSeguimiento(t); // mejor / igual / peor / null
    if (seguimiento === 'mejor') { // si dice que está mejor
      sesion.estado = 'menu'; // vuelve al menú (la carta se queda guardada para "otro")
      return [texto(mensajes.respuestaMejor)]; // manda el cierre positivo
    } // fin del if
    if (seguimiento === 'igual') { // si dice que está igual
      if (!quedanEjercicios(sesion, categoria)) { // si ya no quedan ejercicios en la carta
        sesion.estado = 'menu'; // vuelve al menú
        return [texto(mensajes.igualSinMas)]; // un solo mensaje claro
      } // fin del if
      return [texto(mensajes.respuestaIgual), ...enviarEjercicio(sesion, categoria)]; // manda otro ejercicio
    } // fin del if
    if (seguimiento === 'peor') { // si dice que está peor
      return [texto(mensajes.respuestaPeor)]; // manda el número de atención
    } // fin del if
    // Si escribe otra cosa, se interpreta como un estado de ánimo nuevo (abajo).
  } // fin del if

  // 4. Elegir carta: número, palabras clave o IA local.
  const pregunta = esPregunta(mensaje, t); // revisa si es una pregunta
  let categoria = detectarCategoria(t, pregunta); // intenta detectar la carta
  if (!categoria && esSoloSaludo(t)) { // si no hay carta y es solo un saludo
    sesion.estado = 'menu'; // vuelve al estado de menú
    sesion.categoriaId = null; // borra la carta actual
    return [...inicio, texto(mensajes.menu)]; // manda el menú
  } // fin del if

  // La IA se consulta si no hubo carta o si el mensaje es texto libre (3+ palabras),
  // para que también pueda detectar riesgo que la lista de palabras no cubre.
  const esNumero = Boolean(numeroDeMenu(t, botiquin.length)); // "3" no necesita IA
  const usarIA = !esNumero && (!categoria || palabrasDe(t).length >= PALABRAS_MINIMAS_IA); // decide si consulta la IA
  let empatia = null; // aquí se guarda la frase empática de la IA
  if (usarIA) { // si hay que consultar la IA
    const ia = await ollama.interpretar(mensaje); // le pregunta a la IA local
    if (ia && ia.categoria === 'riesgo') return respuestaCrisis(sesion); // la IA detectó riesgo: mensaje de crisis
    if (ia && ia.categoria) { // si la IA eligió una carta
      if (!categoria) categoria = botiquin.find((c) => c.id === ia.categoria) || null; // usa la carta de la IA si no había
      if (categoria && categoria.id === ia.categoria) empatia = ia.respuesta || null; // la frase solo se usa si coincide con la carta
    } // fin del if
  } // fin del if

  if (categoria) { // si ya hay carta
    return [...inicio, ...(empatia ? [texto(empatia)] : []), ...enviarEjercicio(sesion, categoria)]; // manda bienvenida, frase empática y ejercicio
  } // fin del if

  sesion.estado = 'menu'; // si no entendió, vuelve al menú
  return [...inicio, texto(pregunta ? mensajes.fueraDeTema : mensajes.noEntendi), texto(mensajes.menu)]; // manda "no entendí" (o "esa no la sé") y el menú
} // fin de responder

module.exports = { responder, normalizar, esCrisis, interpretarSeguimiento, detectarCategoria }; // exporta las funciones para usarlas en otros archivos y en las pruebas
