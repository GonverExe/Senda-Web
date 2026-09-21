// fondo.js - vídeo de fondo con su botón de pausa, y pétalos y brasas en un canvas

(function () {
  "use strict";

  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- El vídeo ----------

  const video = document.querySelector(".fondo__video");
  const pausa = document.querySelector("[data-pausa-fondo]");

  if (video) {
    const mostrar = () => video.classList.add("listo");
    video.addEventListener("loadeddata", mostrar);
    if (video.readyState >= 2) mostrar();
    if (quieto) video.removeAttribute("autoplay");
    else video.play().catch(() => {});
  }

  if (video && pausa) {
    const pintar = () => {
      const parado = video.paused;
      pausa.setAttribute("aria-label", parado ? "Reanudar el vídeo de fondo" : "Pausar el vídeo de fondo");
      pausa.setAttribute("aria-pressed", String(parado));
      pausa.innerHTML = parado
        ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>';
    };
    pausa.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
    video.addEventListener("play", pintar);
    video.addEventListener("pause", pintar);
    pintar();
  }

  // ---------- Los pétalos y las brasas ----------

  const lienzo = document.querySelector(".fondo__petalos");
  if (!lienzo || quieto) return;
  const ctx = lienzo.getContext("2d");

  // el vuelo de un pétalo: [momento, x en px, y en % del alto, giro, escala]
  const VUELO = [[0, 0, -14, 0, 1], [0.35, 70, 30, 160, 0.85], [0.7, -40, 70, 320, 1], [1, 60, 115, 520, 0.9]];
  // las brasas: [x, abajo, tamaño, segundos, adelanto]
  const BRASAS = [[0.18, 0.12, 5, 13, 4], [0.28, 0.08, 5, 11, 2], [0.66, 0.08, 4, 14, 6],
    [0.8, 0.1, 5, 12, 9], [0.45, 0.06, 4, 15, 11], [0.9, 0.12, 4, 13, 7]];
  const COLORES = ["#ffc2d1", "#ffb3c8", "#ffdde6"];

  // azar con semilla: los pétalos salen siempre en el mismo sitio
  let semilla = 20240917;
  const azar = () => {
    semilla = (semilla * 1664525 + 1013904223) % 4294967296;
    return semilla / 4294967296;
  };
  const entre = (a, b) => a + (b - a) * azar();

  const CUANTOS = 30;
  const petalos = [];
  for (let i = 0; i < CUANTOS; i++) {
    const ancho = entre(7, 12);
    petalos.push({ x: (i + azar()) / CUANTOS, ancho, alto: ancho * entre(1.25, 1.45),
      color: COLORES[i % 3], segundos: entre(13, 23), adelanto: entre(0, 23) });
  }

  // la hoja: una caja con dos esquinas opuestas muy redondas, centrada en el origen
  const hoja = new Path2D();
  hoja.moveTo(0.5, -0.5);
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * 0.5 * i) / 8;
    hoja.lineTo(-0.2 + Math.cos(a) * 0.7, -0.2 + Math.sin(a) * 0.7);
  }
  hoja.lineTo(-0.5, 0.5);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * 0.5 * i) / 8;
    hoja.lineTo(0.2 + Math.cos(a) * 0.7, 0.2 + Math.sin(a) * 0.7);
  }
  hoja.closePath();

  function pasoVuelo(p) {
    for (let i = 0; i < VUELO.length - 1; i++) {
      const a = VUELO[i];
      const b = VUELO[i + 1];
      if (p <= b[0]) {
        const f = (p - a[0]) / (b[0] - a[0]);
        return a.map((v, k) => v + (b[k] - v) * f);
      }
    }
    return VUELO[VUELO.length - 1];
  }

  let w = 0;
  let h = 0;
  // en pantallas estrechas los pétalos se ven igual de grandes, así que menos
  let escala = 1;

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = lienzo.clientWidth;
    h = lienzo.clientHeight;
    lienzo.width = Math.round(w * dpr);
    lienzo.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    escala = Math.max(0.8, Math.min(1.25, w / 1440));
  }

  function pintar(ms) {
    const t = ms / 1000;
    ctx.clearRect(0, 0, w, h);

    for (const pe of petalos) {
      const p = ((t + pe.adelanto) % pe.segundos) / pe.segundos;
      const [, px, py, giro, esc] = pasoVuelo(p);
      let opacidad = 1;
      if (p < 0.1) opacidad = p / 0.1;
      else if (p > 0.95) opacidad = (1 - p) / 0.05;
      const cx = w * pe.x + pe.ancho * 0.5 + px * escala;
      const cy = pe.alto * 0.5 + (h * py) / 100;
      ctx.save();
      ctx.globalAlpha = opacidad * 0.9;
      ctx.translate(cx, cy);
      ctx.rotate((giro * Math.PI) / 180);
      ctx.scale(pe.ancho * esc * escala, pe.alto * esc * escala);
      ctx.fillStyle = pe.color;
      ctx.fill(hoja);
      ctx.restore();
    }

    for (const b of BRASAS) {
      const p = ((t + b[4]) % b[3]) / b[3];
      const opacidad = p < 0.2 ? (p / 0.2) * 0.9 : 0.9 + (0 - 0.9) * ((p - 0.2) / 0.8);
      const radio = b[2] * 0.5 * (1 + (0.4 - 1) * p);
      const cx = w * b[0] + b[2] * 0.5;
      const cy = h - h * b[1] - b[2] * 0.5 - h * 0.46 * p;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radio + 10);
      halo.addColorStop(0, `rgba(255,150,66,${(140 / 255) * opacidad})`);
      halo.addColorStop(1, "rgba(255,150,66,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radio + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,215,130,${opacidad})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(pintar);
  }

  medir();
  window.addEventListener("resize", medir);
  requestAnimationFrame(pintar);
})();
