// actualizaciones.js - lee el historial de Supabase y lo pinta. Todo lo que
// llega de la base de datos se escribe como texto, nunca como HTML.

(function () {
  "use strict";

  const sb = (window.SENDA || {}).supabase || {};

  const lista = document.getElementById("lista");
  const estado = document.getElementById("estado");

  // ---------- Datos ----------

  async function leer() {
    const base = String(sb.url || "").replace(/\/+$/, "");
    const tabla = encodeURIComponent(sb.tabla || "actualizaciones");
    const respuesta = await fetch(`${base}/rest/v1/${tabla}?select=*`, {
      headers: { apikey: sb.clave, Accept: "application/json" },
    });
    if (!respuesta.ok) throw new Error(`Supabase respondió ${respuesta.status}`);
    return respuesta.json();
  }

  function imagenesDe(fila) {
    let v = fila.imagenes;
    if (typeof v === "string") v = v.split(/[\n,]+/);
    if (!Array.isArray(v)) v = [];
    return v.map((s) => String(s).trim()).filter(esSegura);
  }

  // solo http(s) o rutas propias: nada de javascript: ni data:
  function esSegura(src) {
    if (!src) return false;
    try {
      const u = new URL(src, location.href);
      return u.protocol === "https:" || u.protocol === "http:" || u.protocol === location.protocol;
    } catch (e) {
      return false;
    }
  }

  // "2026-09-20" como fecha local, no como medianoche UTC
  function fechaDe(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto || "");
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  const formato = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

  function esHito(fila) {
    return fila.hito === true || fila.hito === "true";
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

  // **negrita** dentro de una línea
  function enLinea(padre, texto) {
    texto.split(/(\*\*[^*]+\*\*)/g).forEach((trozo) => {
      if (!trozo) return;
      if (/^\*\*[^*]+\*\*$/.test(trozo)) padre.appendChild(el("strong", null, trozo.slice(2, -2)));
      else padre.appendChild(document.createTextNode(sinTildes(trozo)));
    });
  }

  // una línea en blanco separa párrafos; "- " o "* " abre una lista
  function descripcion(texto) {
    const caja = el("div", "texto");
    String(texto || "").replace(/\r/g, "").split(/\n\s*\n/).forEach((bloque) => {
      const lineas = bloque.split("\n").filter((l) => l.trim() !== "");
      let ul = null;
      let p = null;
      lineas.forEach((linea) => {
        const punto = /^\s*[-*•]\s+(.*)$/.exec(linea);
        if (punto) {
          if (!ul) { ul = el("ul"); caja.appendChild(ul); }
          p = null;
          const li = el("li");
          enLinea(li, punto[1]);
          ul.appendChild(li);
        } else {
          ul = null;
          if (p) p.appendChild(el("br"));
          else { p = el("p"); caja.appendChild(p); }
          enLinea(p, linea.trim());
        }
      });
    });
    return caja;
  }

  function sello() {
    const s = el("span", "tablilla__sello", "節目");
    s.setAttribute("aria-hidden", "true");
    return s;
  }

  function cabezaDe(fila, titulo, primera) {
    const cabeza = el("div", "tablilla__cabeza");
    // si el título ya es la versión, no se repite en la etiqueta
    if (fila.version && String(fila.version).trim().toLowerCase() !== titulo.toLowerCase()) {
      cabeza.appendChild(el("span", "version", String(fila.version).toUpperCase()));
    }
    const fecha = fechaDe(fila.fecha);
    if (fecha) {
      const hora = el("time", "fecha", formato.format(fecha));
      hora.dateTime = String(fila.fecha).slice(0, 10);
      cabeza.appendChild(hora);
    }
    if (primera) cabeza.appendChild(el("span", "nueva", "◆ ULTIMA"));
    return cabeza;
  }

  function vitrina(imagenes, i, titulo) {
    const b = el("button", "vitrina");
    b.type = "button";
    b.setAttribute("aria-label", `Ver la imagen ${i + 1} de ${imagenes.length} de «${titulo}» en grande`);
    const img = el("img");
    img.src = imagenes[i];
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    b.appendChild(img);
    b.addEventListener("click", () => lamina.abrir(imagenes, i, titulo, b));
    return b;
  }

  function entrada(fila, primera) {
    const hito = esHito(fila);
    const titulo = String(fila.titulo || "").trim();
    const li = el("li", hito ? "entrada entrada--hito" : "entrada");
    const art = el("article", hito ? "tablilla tablilla--hito" : "tablilla");
    li.appendChild(art);
    if (hito) art.appendChild(sello());
    art.appendChild(cabezaDe(fila, titulo, primera));

    const h2 = el("h2");
    art.appendChild(h2);

    if (!String(fila.descripcion || "").trim() && !imagenesDe(fila).length) {
      h2.textContent = sinTildes(titulo) || "Sin titulo";
      return li;
    }

    // con contenido: un clic en cualquier parte abre la ficha
    art.appendChild(el("div", "raya"));
    art.classList.add("tablilla--abre");
    const boton = el("button", "tablilla__boton", titulo || "Sin titulo");
    boton.type = "button";
    boton.setAttribute("aria-haspopup", "dialog");
    h2.appendChild(boton);
    art.addEventListener("click", () => ficha.abrir(fila, primera, boton));
    return li;
  }

  // ---------- Carga ----------

  function farol(texto, conBoton) {
    estado.replaceChildren();
    estado.hidden = false;
    const caja = el("div", "farol");
    caja.appendChild(el("div", "farol__luz"));
    caja.appendChild(el("p", null, texto));
    if (conBoton) {
      const b = el("button", "boton boton--chico");
      b.type = "button";
      b.appendChild(el("span", null, "VOLVER A INTENTAR"));
      b.addEventListener("click", cargar);
      caja.appendChild(b);
    }
    estado.appendChild(caja);
  }

  async function cargar() {
    farol("Encendiendo los farolillos…");
    lista.replaceChildren();
    try {
      const filas = (await leer()).filter((f) => f && f.publicada !== false);
      // de la más nueva a la más antigua; a igual fecha, por versión
      filas.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.version || "").localeCompare(String(a.version || ""), "es", { numeric: true }));
      if (!filas.length) {
        farol("Todavia no hay nada escrito en la bitacora.");
        return;
      }
      estado.hidden = true;
      filas.forEach((f, i) => lista.appendChild(entrada(f, i === 0)));
    } catch (error) {
      console.error(error);
      farol("No se ha podido leer la bitacora. Comprueba la conexion.", true);
    }
  }

  // la página de detrás no se desplaza mientras haya una ventana abierta
  function bloquear() {
    const abierta = !document.getElementById("ficha").hidden || !document.getElementById("lamina").hidden;
    document.body.style.overflow = abierta ? "hidden" : "";
  }

  // ---------- Lámina: una captura en grande ----------

  const lamina = (function () {
    const caja = document.getElementById("lamina");
    const img = caja.querySelector("img");
    const pie = caja.querySelector("figcaption");
    const antes = caja.querySelector("[data-antes]");
    const despues = caja.querySelector("[data-despues]");
    const cerrar = caja.querySelector("[data-cerrar]");
    let fotos = [];
    let i = 0;
    let titulo = "";
    let volver = null;

    function pintar() {
      img.src = fotos[i];
      img.alt = `${titulo}, imagen ${i + 1} de ${fotos.length}`;
      pie.textContent = sinTildes(fotos.length > 1 ? `${titulo} · ${i + 1} / ${fotos.length}` : titulo);
      antes.hidden = despues.hidden = fotos.length < 2;
    }

    function paso(d) {
      i = (i + d + fotos.length) % fotos.length;
      pintar();
    }

    function cerrarla() {
      caja.hidden = true;
      bloquear();
      if (volver) volver.focus();
    }

    antes.addEventListener("click", () => paso(-1));
    despues.addEventListener("click", () => paso(1));
    cerrar.addEventListener("click", cerrarla);
    caja.addEventListener("click", (e) => { if (e.target === caja) cerrarla(); });
    document.addEventListener("keydown", (e) => {
      if (caja.hidden) return;
      // preventDefault: el mismo Escape no cierra también la ficha de debajo
      if (e.key === "Escape") { e.preventDefault(); cerrarla(); }
      else if (e.key === "ArrowLeft" && fotos.length > 1) paso(-1);
      else if (e.key === "ArrowRight" && fotos.length > 1) paso(1);
    });

    return {
      abrir(lista, desde, t, boton) {
        fotos = lista;
        i = desde;
        titulo = t;
        volver = boton;
        pintar();
        caja.hidden = false;
        bloquear();
        cerrar.focus();
      },
    };
  })();

  // ---------- Ficha: una actualización entera ----------

  const ficha = (function () {
    const caja = document.getElementById("ficha");
    const tablilla = caja.querySelector(".ficha__tablilla");
    const texto = caja.querySelector(".ficha__texto");
    const fotos = caja.querySelector(".ficha__fotos");
    const cerrar = caja.querySelector("[data-cerrar]");
    let volver = null;

    function cerrarla() {
      caja.hidden = true;
      bloquear();
      if (volver) volver.focus();
    }

    cerrar.addEventListener("click", cerrarla);
    caja.addEventListener("click", (e) => { if (e.target === caja) cerrarla(); });
    document.addEventListener("keydown", (e) => {
      if (caja.hidden || e.key !== "Escape" || e.defaultPrevented) return;
      cerrarla();
    });

    // la rueda vertical mueve la tira de capturas en horizontal
    fotos.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const hasta = fotos.scrollWidth - fotos.clientWidth;
      if ((e.deltaY < 0 && fotos.scrollLeft <= 0) || (e.deltaY > 0 && fotos.scrollLeft >= hasta)) return;
      e.preventDefault();
      // Firefox cuenta en líneas, no en píxeles
      fotos.scrollLeft += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    }, { passive: false });

    // difumina el borde por el que quedan capturas escondidas
    function fundir() {
      const hasta = fotos.scrollWidth - fotos.clientWidth;
      fotos.classList.toggle("hay-antes", fotos.scrollLeft > 1);
      fotos.classList.toggle("hay-despues", fotos.scrollLeft < hasta - 1);
    }
    fotos.addEventListener("scroll", fundir, { passive: true });
    window.addEventListener("resize", () => { if (!caja.hidden) fundir(); });

    return {
      abrir(fila, primera, boton) {
        const titulo = String(fila.titulo || "").trim() || "Sin titulo";
        const hito = esHito(fila);
        const imagenes = imagenesDe(fila);
        volver = boton;

        tablilla.classList.toggle("tablilla--hito", hito);
        const viejo = tablilla.querySelector(".tablilla__sello");
        if (viejo) viejo.remove();
        if (hito) tablilla.prepend(sello());

        const h2 = el("h2", null, titulo);
        h2.id = "ficha-titulo";
        texto.replaceChildren(cabezaDe(fila, titulo, primera), h2, el("div", "raya"));
        if (String(fila.descripcion || "").trim()) texto.appendChild(descripcion(fila.descripcion));

        fotos.replaceChildren(...imagenes.map((src, i) => vitrina(imagenes, i, titulo)));
        fotos.hidden = !imagenes.length;
        caja.classList.toggle("ficha--sin-fotos", !imagenes.length);

        caja.hidden = false;
        texto.scrollTop = 0;
        fotos.scrollLeft = 0;
        fundir();
        bloquear();
        cerrar.focus();
      },
    };
  })();

  cargar();
})();
