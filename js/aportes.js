// aportes.js - lo que comparten el tablón y su formulario: hablar con Supabase,
// quién vota desde este navegador y cómo se llama cada estado

window.Aportes = (function () {
  "use strict";

  const sb = (window.SENDA || {}).supabase || {};
  const base = String(sb.url || "").replace(/\/+$/, "");
  const cubo = encodeURIComponent(sb.adjuntos || "adjuntos");

  // "votantes" no se puede leer, así que las demás columnas se piden por su nombre
  const COMUNES = "id,titulo,descripcion,adjuntos,estado,votos,creado";
  const TABLAS = {
    idea: { nombre: encodeURIComponent(sb.ideas || "ideas"), campos: COMUNES },
    error: { nombre: encodeURIComponent(sb.errores || "errores"), campos: `${COMUNES},pasos,version,plataforma` },
  };

  // ---------- Supabase ----------

  async function pedir(ruta, opciones) {
    const cabeceras = { apikey: sb.clave, Accept: "application/json" };
    if (opciones && opciones.body) cabeceras["Content-Type"] = "application/json";
    const respuesta = await fetch(`${base}/rest/v1/${ruta}`, Object.assign({}, opciones, { headers: cabeceras }));
    const texto = await respuesta.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = null; }
    if (!respuesta.ok) {
      const error = new Error((datos && datos.message) || `Supabase respondió ${respuesta.status}`);
      error.estado = respuesta.status;
      throw error;
    }
    return datos;
  }

  function rpc(funcion, datos) {
    return pedir(`rpc/${funcion}`, { method: "POST", body: JSON.stringify(datos) });
  }

  // ---------- Archivos adjuntos ----------

  // lo mismo que deja el bucket (supabase/aportes.sql): 4 archivos de 10 MB
  const ADJUNTOS = {
    maximo: 4,
    peso: 10 * 1024 * 1024,
    tipos: ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "text/plain"],
  };

  // los registros (.log) suelen llegar sin tipo: se mandan como texto
  function tipoDe(archivo) {
    if (archivo.type) return archivo.type;
    return /\.(log|txt)$/i.test(archivo.name) ? "text/plain" : "";
  }

  // "Captura del jefe (2).PNG" -> "captura-del-jefe-2.png"
  function nombreLimpio(nombre) {
    const limpio = sinTildes(nombre).toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
    return (limpio || "archivo").slice(-60);
  }

  // sube un archivo a la carpeta de este navegador y devuelve cómo se guarda
  async function subir(archivo) {
    const tipo = tipoDe(archivo);
    const azar = nuevoId().slice(0, 8);
    const ruta = `${votante()}/${azar}-${nombreLimpio(archivo.name)}`;
    const respuesta = await fetch(`${base}/storage/v1/object/${cubo}/${ruta.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { apikey: sb.clave, "Content-Type": tipo, "x-upsert": "false" },
      body: archivo,
    });
    if (!respuesta.ok) {
      const error = new Error(`No se pudo subir ${archivo.name} (${respuesta.status})`);
      error.estado = respuesta.status;
      throw error;
    }
    return { ruta, nombre: String(archivo.name).slice(0, 120), tipo, peso: archivo.size };
  }

  // solo rutas del propio bucket: carpeta de un navegador y nombre limpio
  const RUTA = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,100}$/i;

  function adjuntosDe(a) {
    return (Array.isArray(a.adjuntos) ? a.adjuntos : [])
      .filter((x) => x && RUTA.test(x.ruta || ""))
      .map((x) => Object.assign({}, x, { url: `${base}/storage/v1/object/public/${cubo}/${x.ruta}` }));
  }

  function peso(bytes) {
    if (!(bytes > 0)) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  }

  // ---------- Quién vota ----------

  // un número al azar guardado en este navegador. No identifica a nadie: solo
  // sirve para que cada navegador cuente una vez por aporte
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let votanteId = null;

  function votante() {
    if (votanteId) return votanteId;
    try { votanteId = localStorage.getItem("senda.votante"); } catch (e) { /* sin almacenamiento */ }
    if (!UUID.test(votanteId || "")) {
      votanteId = nuevoId();
      try { localStorage.setItem("senda.votante", votanteId); } catch (e) { /* dura lo que la pestaña */ }
    }
    return votanteId;
  }

  function nuevoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // ---------- Nombres ----------

  const ESTADOS = {
    abierto: { idea: "ABIERTA", error: "ABIERTO" },
    confirmado: { idea: "ACEPTADA", error: "CONFIRMADO" },
    en_curso: { idea: "EN CURSO", error: "EN CURSO" },
    resuelto: { idea: "HECHA", error: "ARREGLADO" },
    duplicado: { idea: "DUPLICADA", error: "DUPLICADO" },
    descartado: { idea: "DESCARTADA", error: "NO SE ARREGLARA" },
  };

  function nombreEstado(a) {
    return (ESTADOS[a.estado] || ESTADOS.abierto)[a.tipo === "error" ? "error" : "idea"];
  }

  // como en Mojira: IDEA-12, ERR-40. Es el mismo id que tiene en la base de datos
  function codigo(a) {
    return String(a.id);
  }

  const corta = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const larga = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

  function fecha(texto, largo) {
    const d = new Date(texto);
    return isNaN(d) ? "" : (largo ? larga : corta).format(d);
  }

  // ---------- Piezas ----------

  // la fuente de Senda no tiene letras con tilde ni ñ: "canción" -> "cancion"
  function sinTildes(texto) {
    return String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function el(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = sinTildes(texto);
    return nodo;
  }

  return {
    // las ideas y los errores juntos, cada uno con su "tipo"
    async leer() {
      const tipos = Object.keys(TABLAS);
      const filas = await Promise.all(tipos.map((tipo) =>
        pedir(`${TABLAS[tipo].nombre}?select=${TABLAS[tipo].campos}&order=creado.desc&limit=1000`)));
      return filas.flatMap((lista, i) => (lista || []).map((a) => Object.assign({ tipo: tipos[i] }, a)));
    },

    async misVotos() {
      const filas = await rpc("mis_votos", { p_votante: votante() });
      return new Set((filas || []).map((f) => f.aporte_id));
    },

    votar: (id) => rpc("votar", { p_aporte: id, p_votante: votante() }),

    enviar: (d) => rpc("enviar_aporte", {
      p_tipo: d.tipo,
      p_titulo: d.titulo,
      p_descripcion: d.descripcion,
      p_pasos: d.pasos || null,
      p_version: d.version || null,
      p_plataforma: d.plataforma || null,
      p_adjuntos: d.adjuntos || [],
      p_votante: votante(),
    }),

    subir,
    tipoDe,
    adjuntosDe,
    peso,
    ADJUNTOS,

    // las versiones del historial, de la más nueva a la más antigua
    async versiones() {
      const filas = await pedir(`${encodeURIComponent(sb.tabla || "actualizaciones")}?select=*`);
      return (filas || [])
        .filter((f) => f && f.publicada !== false && String(f.version || "").trim())
        .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
        .map((f) => String(f.version).trim())
        .filter((v, i, todas) => todas.indexOf(v) === i);
    },

    nombreEstado,
    codigo,
    fecha,
    sinTildes,
    el,
  };
})();
