// tablon.js - el tablón: lista las ideas y los errores, los filtra, abre la
// ficha de cada uno y deja votar. Todo lo que llega de la base de datos se
// escribe como texto, nunca como HTML.

(function () {
  "use strict";

  const A = window.Aportes;
  const el = A.el;

  const lista = document.getElementById("lista");
  const estado = document.getElementById("estado");
  const cuenta = document.getElementById("cuenta");
  const buscar = document.getElementById("buscar");
  const orden = document.getElementById("orden");
  const pestanas = document.querySelectorAll("[data-tipo]");
  const aportar = document.querySelector("[data-aportar]");

  const FLECHA = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5l6.5 7H10.5V14h-5V8.5H1.5z"/></svg>';

  let todos = [];
  let votados = new Set();
  let tipo = "todo";

  // tablon.html?tipo=error abre directamente esa pestaña
  const pedido = new URLSearchParams(location.search).get("tipo");
  if (pedido === "idea" || pedido === "error") tipo = pedido;

  // ---------- Filtrar y ordenar ----------

  const normal = (texto) => A.sinTildes(texto || "").toLowerCase();
  const cuando = (texto) => Date.parse(texto) || 0;

  const ORDENES = {
    votos: (a, b) => b.votos - a.votos || cuando(b.creado) - cuando(a.creado),
    nuevos: (a, b) => cuando(b.creado) - cuando(a.creado),
  };

  function pasa(a) {
    if (tipo !== "todo" && a.tipo !== tipo) return false;
    const busca = normal(buscar.value.trim());
    return !busca || normal(`${A.codigo(a)} ${a.titulo} ${a.descripcion}`).includes(busca);
  }

  function pintar() {
    pestanas.forEach((p) => p.setAttribute("aria-pressed", String(p.dataset.tipo === tipo)));
    // desde la pestaña de errores, el formulario llega con "un error" ya elegido
    if (aportar) aportar.href = tipo === "error" ? "enviar.html?tipo=error" : "enviar.html";
    const vistos = todos.filter(pasa).sort(ORDENES[orden.value] || ORDENES.votos);
    lista.replaceChildren(...vistos.map(tarjeta));
    cuenta.textContent = todos.length ? `${vistos.length} DE ${todos.length}` : "";
    if (!todos.length) farol("Todavia no hay nada en el tablon. Estrenalo tu.");
    else if (!vistos.length) farol("Nada coincide con lo que buscas.");
    else estado.hidden = true;
  }

  pestanas.forEach((p) => p.addEventListener("click", () => { tipo = p.dataset.tipo; pintar(); }));
  buscar.addEventListener("input", pintar);
  orden.addEventListener("change", pintar);

  // ---------- Piezas ----------

  function cabeza(a) {
    const c = el("div", "cabeza");
    c.appendChild(el("span", "codigo", A.codigo(a)));
    c.appendChild(el("span", `tipo tipo--${a.tipo}`, a.tipo === "error" ? "ERROR" : "IDEA"));
    c.appendChild(el("span", `estado estado--${a.estado}`, A.nombreEstado(a)));
    return c;
  }

  function botonVoto(a) {
    const b = el("button", "voto");
    b.type = "button";
    b.dataset.voto = a.id;
    b.innerHTML = FLECHA;
    b.appendChild(el("span", "voto__cuenta"));
    marcarVoto(b, a);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      votar(a);
    });
    return b;
  }

  function marcarVoto(b, a) {
    const dentro = votados.has(a.id);
    b.setAttribute("aria-pressed", String(dentro));
    b.setAttribute("aria-label", `${dentro ? "Quitar tu voto de" : "Votar"} ${A.codigo(a)}. Lleva ${a.votos} ${a.votos === 1 ? "voto" : "votos"}.`);
    b.querySelector(".voto__cuenta").textContent = a.votos;
  }

  function tarjeta(a) {
    const li = el("li");
    const art = el("article", `tablilla aporte aporte--${a.tipo}`);
    li.appendChild(art);
    art.appendChild(botonVoto(a));

    const cuerpo = el("div", "aporte__cuerpo");
    cuerpo.appendChild(cabeza(a));
    const h2 = el("h2", "aporte__titulo");
    const boton = el("button", "aporte__boton", a.titulo);
    boton.type = "button";
    boton.setAttribute("aria-haspopup", "dialog");
    h2.appendChild(boton);
    cuerpo.appendChild(h2);
    cuerpo.appendChild(el("p", "aporte__resumen", a.descripcion));

    const pie = el("p", "aporte__pie", A.fecha(a.creado));
    const archivos = A.adjuntosDe(a).length;
    if (archivos) pie.appendChild(el("span", "con-archivos", `+ ${archivos} ${archivos === 1 ? "ARCHIVO" : "ARCHIVOS"}`));
    cuerpo.appendChild(pie);
    art.appendChild(cuerpo);

    // un clic en cualquier parte de la tablilla abre la ficha
    art.addEventListener("click", () => detalle.abrir(a, boton));
    return li;
  }

  // ---------- Votar ----------

  async function votar(a) {
    if (a.votando) return;
    a.votando = true;
    const botones = () => document.querySelectorAll(`[data-voto="${a.id}"]`);
    botones().forEach((b) => b.setAttribute("aria-busy", "true"));
    try {
      const r = await A.votar(a.id);
      a.votos = r.votos;
      if (r.votado) votados.add(a.id);
      else votados.delete(a.id);
    } catch (error) {
      console.error(error);
      brindis("No se ha podido votar. Prueba otra vez.");
    }
    a.votando = false;
    botones().forEach((b) => {
      b.removeAttribute("aria-busy");
      marcarVoto(b, a);
    });
  }

  // ---------- Avisos ----------

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

  const tostada = document.getElementById("brindis");
  let apagar = 0;
  function brindis(texto) {
    tostada.textContent = A.sinTildes(texto);
    tostada.hidden = false;
    clearTimeout(apagar);
    apagar = setTimeout(() => { tostada.hidden = true; }, 2800);
  }

  // ---------- Ficha: un aporte entero ----------

  const detalle = (function () {
    const caja = document.getElementById("detalle");
    const texto = caja.querySelector(".detalle__texto");
    const cerrar = caja.querySelector("[data-cerrar]");
    let volver = null;

    function seccion(titulo, cuerpo) {
      const s = el("section", "seccion");
      s.appendChild(el("h3", null, titulo));
      s.appendChild(el("p", null, cuerpo));
      return s;
    }

    // capturas y registros abren el archivo en otra pestaña; los vídeos se ven aquí
    function archivos(adjuntos) {
      const s = el("section", "seccion");
      s.appendChild(el("h3", null, "ARCHIVOS"));
      const ul = el("ul", "adjuntos");
      adjuntos.forEach((x) => {
        const li = el("li", "pieza");
        let vista;
        if (/^video\//.test(x.tipo)) {
          vista = el("div", "pieza__vista");
          const video = el("video");
          video.src = x.url;
          video.controls = true;
          video.preload = "metadata";
          vista.appendChild(video);
        } else {
          vista = el("a", "pieza__vista");
          vista.href = x.url;
          vista.target = "_blank";
          vista.rel = "noopener";
          vista.setAttribute("aria-label", `Abrir ${x.nombre}`);
          if (/^image\//.test(x.tipo)) {
            const img = el("img");
            img.src = x.url;
            img.alt = "";
            img.loading = "lazy";
            vista.appendChild(img);
          } else {
            vista.appendChild(document.createTextNode("LOG"));
          }
        }
        li.appendChild(vista);
        const nombre = el("span", "pieza__nombre", `${x.nombre} ${A.peso(x.peso)}`.trim());
        nombre.title = x.nombre;
        li.appendChild(nombre);
        ul.appendChild(li);
      });
      s.appendChild(ul);
      return s;
    }

    function cerrarla() {
      caja.hidden = true;
      document.body.style.overflow = "";
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
      if (volver) volver.focus();
    }

    cerrar.addEventListener("click", cerrarla);
    caja.addEventListener("click", (e) => { if (e.target === caja) cerrarla(); });
    document.addEventListener("keydown", (e) => {
      if (!caja.hidden && e.key === "Escape") cerrarla();
    });

    function abrir(a, boton) {
      if (boton) volver = boton;
      const arriba = el("div", "detalle__arriba");
      arriba.appendChild(botonVoto(a));
      const titulos = el("div", "detalle__titulos");
      titulos.appendChild(cabeza(a));
      const h2 = el("h2", "detalle__titulo", a.titulo);
      h2.id = "detalle-titulo";
      titulos.appendChild(h2);
      titulos.appendChild(el("p", "detalle__meta", `Enviado el ${A.fecha(a.creado, true)}`));
      arriba.appendChild(titulos);
      texto.replaceChildren(arriba, el("div", "raya"));
      texto.appendChild(seccion(a.tipo === "error" ? "QUE PASA" : "LA IDEA", a.descripcion));
      if (a.pasos) texto.appendChild(seccion("COMO REPETIRLO", a.pasos));

      const adjuntos = A.adjuntosDe(a);
      if (adjuntos.length) texto.appendChild(archivos(adjuntos));

      if (a.version || a.plataforma) {
        const datos = el("dl", "datos");
        [["VERSION", a.version], ["PLATAFORMA", a.plataforma]].forEach(([nombre, valor]) => {
          if (!valor) return;
          const par = el("div");
          par.appendChild(el("dt", null, nombre));
          par.appendChild(el("dd", null, valor));
          datos.appendChild(par);
        });
        texto.appendChild(datos);
      }

      const acciones = el("div", "detalle__acciones");
      const copiar = el("button", "boton boton--callado boton--chico");
      copiar.type = "button";
      copiar.appendChild(el("span", null, "COPIAR ENLACE"));
      copiar.addEventListener("click", async () => {
        const url = `${location.href.split("#")[0]}#${A.codigo(a)}`;
        try {
          await navigator.clipboard.writeText(url);
          brindis("Enlace copiado.");
        } catch (e) {
          brindis(url);
        }
      });
      acciones.appendChild(copiar);
      texto.appendChild(acciones);

      // el enlace de la barra lleva a este aporte: se puede compartir
      history.replaceState(null, "", `${location.pathname}${location.search}#${A.codigo(a)}`);
      caja.hidden = false;
      texto.scrollTop = 0;
      document.body.style.overflow = "hidden";
      cerrar.focus();
    }

    return { abrir, cerrar: cerrarla, get abierta() { return !caja.hidden; } };
  })();

  // tablon.html#ERR-12 abre esa ficha nada más cargar
  function desdeEnlace() {
    const m = /^#((?:IDEA|ERR)-\d+)$/i.exec(location.hash);
    if (!m) {
      if (detalle.abierta) detalle.cerrar();
      return;
    }
    const a = todos.find((x) => x.id === m[1].toUpperCase());
    if (a) detalle.abrir(a, null);
    else brindis("Ese aporte no existe o se ha retirado.");
  }

  window.addEventListener("hashchange", desdeEnlace);

  // ---------- Carga ----------

  async function cargar() {
    farol("Leyendo el tablon…");
    lista.replaceChildren();
    cuenta.textContent = "";
    try {
      const [filas, mios] = await Promise.all([A.leer(), A.misVotos().catch(() => new Set())]);
      todos = filas || [];
      votados = mios;
    } catch (error) {
      console.error(error);
      farol(error.estado === 404
        ? "El tablon todavia no esta abierto. Vuelve dentro de poco."
        : "No se ha podido leer el tablon. Comprueba la conexion.", true);
      return;
    }
    pintar();
    if (location.hash) desdeEnlace();
  }

  cargar();
})();
