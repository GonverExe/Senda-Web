// enviar.js - el formulario del tablón: una idea o un error, con capturas,
// vídeos o registros si hace falta. Avisa si ya hay algo parecido en el
// tablón, sube los archivos y lo manda a Supabase.

(function () {
  "use strict";

  const A = window.Aportes;
  const el = A.el;

  const form = document.getElementById("formulario");
  const campos = form.elements;
  const aviso = document.getElementById("aviso");
  const letrero = form.querySelector("[type=submit] span");
  const parecidos = document.getElementById("parecidos");
  const hecho = document.getElementById("hecho");

  const BOTONES = { idea: "ENVIAR IDEA", error: "ENVIAR ERROR" };

  const tipo = () => (campos.tipo.value === "error" ? "error" : "idea");

  // ---------- Idea o error ----------

  function aplicarTipo() {
    form.querySelectorAll("[data-solo-error]").forEach((n) => { n.hidden = tipo() !== "error"; });
    letrero.textContent = BOTONES[tipo()];
    buscarParecidos();
  }

  form.querySelectorAll('[name="tipo"]').forEach((r) => r.addEventListener("change", aplicarTipo));

  // ---------- Contadores de letras ----------

  const contadores = [];
  form.querySelectorAll("[data-cuenta]").forEach((cuenta) => {
    const campo = campos[cuenta.dataset.cuenta];
    const pintar = () => { cuenta.textContent = `${campo.value.length}/${campo.maxLength}`; };
    campo.addEventListener("input", pintar);
    contadores.push(pintar);
  });
  const contar = () => contadores.forEach((pintar) => pintar());

  // ---------- Archivos: cuatro huecos ----------

  const entrada = document.getElementById("archivos");
  const ranuras = document.getElementById("ranuras");
  const cuentaArchivos = document.getElementById("archivos-cuenta");
  const CRUZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // [{ archivo, url }]: la url es la vista previa local, se libera al quitarlo
  let elegidos = [];

  function agregarArchivos(lista) {
    const problemas = [];
    Array.from(lista || []).forEach((archivo) => {
      if (elegidos.length >= A.ADJUNTOS.maximo) {
        problemas.push(`Como mucho ${A.ADJUNTOS.maximo} archivos.`);
      } else if (!A.ADJUNTOS.tipos.includes(A.tipoDe(archivo))) {
        problemas.push(`"${archivo.name}" no es una imagen, un video o un registro.`);
      } else if (archivo.size > A.ADJUNTOS.peso) {
        problemas.push(`"${archivo.name}" pesa mas de 10 MB.`);
      } else if (elegidos.some((e) => e.archivo.name === archivo.name && e.archivo.size === archivo.size)) {
        // el mismo archivo dos veces: se ignora sin avisar
      } else {
        elegidos.push({ archivo, url: URL.createObjectURL(archivo) });
      }
    });
    // un aviso por tipo de problema, no uno por archivo repetido
    const unicos = problemas.filter((p, i) => problemas.indexOf(p) === i);
    if (unicos.length) mostrarAviso(unicos.join(" "));
    pintarArchivos();
  }

  function quitarArchivo(i) {
    URL.revokeObjectURL(elegidos[i].url);
    elegidos.splice(i, 1);
    pintarArchivos();
    // el foco pasa a otro botón de quitar o al de agregar
    const siguiente = ranuras.querySelectorAll(".ranura__quitar")[i] || ranuras.querySelector(".ranura--agregar button");
    if (siguiente) siguiente.focus();
  }

  function vaciarArchivos() {
    elegidos.forEach((e) => URL.revokeObjectURL(e.url));
    elegidos = [];
    pintarArchivos();
  }

  function vistaDe({ archivo, url }) {
    const tipo = A.tipoDe(archivo);
    const caja = el("div", "ranura__caja");
    if (tipo.startsWith("image/")) {
      const img = el("img");
      img.src = url;
      img.alt = "";
      caja.appendChild(img);
    } else if (tipo.startsWith("video/")) {
      const video = el("video");
      video.src = url;
      video.muted = true;
      video.preload = "metadata";
      caja.appendChild(video);
      caja.appendChild(el("span", "ranura__sello", "VIDEO"));
    } else {
      const texto = el("pre", "ranura__texto");
      archivo.slice(0, 400).text().then((t) => { texto.textContent = t; }).catch(() => {});
      caja.appendChild(texto);
      caja.appendChild(el("span", "ranura__sello", "LOG"));
    }
    return caja;
  }

  function pintarArchivos() {
    const huecos = [];
    for (let i = 0; i < A.ADJUNTOS.maximo; i++) {
      const e = elegidos[i];
      if (e) {
        const li = el("li", "ranura ranura--llena");
        li.appendChild(vistaDe(e));
        const quitar = el("button", "mando ranura__quitar");
        quitar.type = "button";
        quitar.innerHTML = CRUZ;
        quitar.setAttribute("aria-label", `Quitar ${e.archivo.name}`);
        quitar.addEventListener("click", () => quitarArchivo(i));
        li.appendChild(quitar);
        const nombre = el("p", "ranura__nombre");
        nombre.appendChild(el("span", null, e.archivo.name));
        nombre.appendChild(el("span", null, A.peso(e.archivo.size)));
        nombre.title = e.archivo.name;
        li.appendChild(nombre);
        huecos.push(li);
      } else if (i === elegidos.length) {
        const li = el("li", "ranura ranura--agregar");
        const boton = el("button", "ranura__caja");
        boton.type = "button";
        boton.setAttribute("aria-label", "Agregar archivos");
        boton.appendChild(el("b", null, "+"));
        boton.appendChild(el("span", null, "AGREGAR"));
        boton.addEventListener("click", () => entrada.click());
        li.appendChild(boton);
        huecos.push(li);
      } else {
        const li = el("li", "ranura ranura--vacia");
        li.setAttribute("aria-hidden", "true");
        li.appendChild(el("div", "ranura__caja"));
        huecos.push(li);
      }
    }
    ranuras.replaceChildren(...huecos);
    cuentaArchivos.textContent = `${elegidos.length}/${A.ADJUNTOS.maximo}`;
  }

  entrada.addEventListener("change", () => {
    agregarArchivos(entrada.files);
    // vaciarlo deja volver a elegir el mismo archivo después de quitarlo
    entrada.value = "";
  });

  // arrastrar archivos sobre los huecos
  ["dragenter", "dragover"].forEach((ev) => ranuras.addEventListener(ev, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
    e.preventDefault();
    ranuras.classList.add("encima");
  }));
  ranuras.addEventListener("dragleave", (e) => {
    if (!ranuras.contains(e.relatedTarget)) ranuras.classList.remove("encima");
  });
  ranuras.addEventListener("drop", (e) => {
    e.preventDefault();
    ranuras.classList.remove("encima");
    agregarArchivos(e.dataTransfer.files);
  });

  // pegar una captura (Ctrl+V) en cualquier parte del formulario
  document.addEventListener("paste", (e) => {
    if (form.hidden || !e.clipboardData || !e.clipboardData.files.length) return;
    e.preventDefault();
    agregarArchivos(e.clipboardData.files);
  });

  // ---------- ¿Ya está en el tablón? ----------

  // palabras que no dicen nada de qué va el aporte
  const VACIAS = new Set(("para como cuando pero esta este esto estos estas porque donde despues antes todo toda " +
    "todos todas sobre hace tiene tengo juego senda puede poder tambien mucho muchos desde hasta entre algo " +
    "cosa cosas seria estaria habia hacer").split(" "));

  // la raíz de cada palabra: "atascado" y "atasca" cuentan como la misma
  function raices(texto) {
    return new Set(A.sinTildes(texto).toLowerCase().split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !VACIAS.has(p))
      .map((p) => p.slice(0, 5)));
  }

  let existentes = [];
  A.leer().then((filas) => {
    existentes = (filas || []).map((a) => ({ a, raices: raices(a.titulo) }));
    buscarParecidos();
  }).catch(() => { /* sin tablón no hay sugerencias */ });

  function buscarParecidos() {
    const mias = raices(campos.titulo.value);
    const minimo = Math.min(2, mias.size);
    const hallados = !mias.size ? [] : existentes
      .map(({ a, raices: suyas }) => {
        let n = 0;
        suyas.forEach((r) => { if (mias.has(r)) n += 1; });
        return { a, n: n + (n && a.tipo === tipo() ? 0.5 : 0) };
      })
      .filter((x) => x.n >= minimo)
      .sort((x, y) => y.n - x.n || y.a.votos - x.a.votos)
      .slice(0, 3);

    const ul = parecidos.querySelector("ul");
    ul.replaceChildren(...hallados.map(({ a }) => {
      const li = el("li");
      const enlace = el("a");
      enlace.href = `tablon.html#${A.codigo(a)}`;
      enlace.target = "_blank";
      enlace.rel = "noopener";
      enlace.appendChild(el("span", "codigo", A.codigo(a)));
      enlace.appendChild(el("span", `estado estado--${a.estado}`, A.nombreEstado(a)));
      enlace.appendChild(el("span", "parecidos__titulo", a.titulo));
      li.appendChild(enlace);
      return li;
    }));
    parecidos.hidden = !hallados.length;
  }

  let espera = 0;
  campos.titulo.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(buscarParecidos, 250);
  });

  // ---------- Versiones del historial ----------

  A.versiones().then((versiones) => {
    const lista = document.getElementById("versiones");
    lista.replaceChildren(...versiones.map((v) => {
      const o = el("option");
      o.value = v;
      return o;
    }));
  }).catch(() => { /* se escribe a mano */ });

  // ---------- Enviar ----------

  function mostrarAviso(texto) {
    aviso.textContent = A.sinTildes(texto);
    aviso.hidden = false;
  }

  form.addEventListener("input", () => { aviso.hidden = true; });

  function revisar() {
    if (campos.titulo.value.trim().length < 4) {
      return { campo: campos.titulo, texto: "Ponle un titulo de al menos 4 letras." };
    }
    if (campos.descripcion.value.trim().length < 10) {
      return { campo: campos.descripcion, texto: "Cuenta un poco mas en la descripcion (10 letras como minimo)." };
    }
    return null;
  }

  let enviando = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando) return;

    const fallo = revisar();
    if (fallo) {
      mostrarAviso(fallo.texto);
      fallo.campo.focus();
      return;
    }

    // solo un robot rellena la trampa: se le da las gracias y no se envía nada
    if (campos.web.value) {
      terminar(null);
      return;
    }

    enviando = true;
    form.setAttribute("aria-busy", "true");
    try {
      const adjuntos = [];
      for (let i = 0; i < elegidos.length; i++) {
        letrero.textContent = `SUBIENDO ${i + 1}/${elegidos.length}…`;
        // si el envío falló después de subirlo, al reintentar no se sube otra vez
        if (!elegidos[i].subido) elegidos[i].subido = await A.subir(elegidos[i].archivo);
        adjuntos.push(elegidos[i].subido);
      }
      letrero.textContent = "ENVIANDO…";
      const datos = {
        tipo: tipo(),
        titulo: campos.titulo.value.trim(),
        descripcion: campos.descripcion.value.trim(),
        adjuntos,
      };
      if (datos.tipo === "error") {
        datos.pasos = campos.pasos.value.trim();
        datos.version = campos.version.value.trim();
        datos.plataforma = campos.plataforma.value;
      }
      const id = await A.enviar(datos);
      terminar({ id, tipo: datos.tipo });
    } catch (error) {
      console.error(error);
      mostrarAviso(/demasiados/.test(error.message)
        ? "Has enviado muchas cosas seguidas. Espera un rato y vuelve a probar."
        : /subir/.test(error.message)
          ? `${error.message}. Prueba otra vez o quita ese archivo.`
          : error.estado === 404
            ? "El tablon todavia no esta abierto. Vuelve dentro de poco."
            : "No se ha podido enviar. Comprueba la conexion y prueba otra vez.");
    }
    enviando = false;
    form.removeAttribute("aria-busy");
    letrero.textContent = BOTONES[tipo()];
  });

  function terminar(aporte) {
    const codigo = aporte ? A.codigo(aporte) : "";
    document.getElementById("hecho-codigo").textContent = codigo;
    document.getElementById("hecho-ver").href = codigo ? `tablon.html#${codigo}` : "tablon.html";
    form.hidden = true;
    hecho.hidden = false;
    hecho.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.getElementById("hecho-otro").addEventListener("click", () => {
    const antes = tipo();
    form.reset();
    campos.tipo.value = antes;
    vaciarArchivos();
    hecho.hidden = true;
    form.hidden = false;
    aplicarTipo();
    contar();
    campos.titulo.focus();
  });

  // ---------- Al abrir ----------

  // enviar.html?tipo=error llega con "un error" ya elegido
  const pedido = new URLSearchParams(location.search).get("tipo");
  if (pedido === "idea" || pedido === "error") campos.tipo.value = pedido;
  aplicarTipo();
  contar();
  pintarArchivos();
})();
