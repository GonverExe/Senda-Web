// index.js - portada: enlace de Steam y ventana del tráiler

(function () {
  "use strict";

  const config = window.SENDA || {};
  document.querySelectorAll("[data-steam]").forEach((enlace) => {
    if (config.steam) enlace.href = config.steam;
  });

  const cine = document.getElementById("cine");
  const abrir = document.querySelector("[data-abrir-trailer]");
  if (!cine || !abrir) return;

  const trailer = cine.querySelector("video");
  const cerrar = cine.querySelector("[data-cerrar-trailer]");
  const fondo = document.querySelector(".fondo__video");
  let fondoIba = false;

  function abrirCine() {
    fondoIba = fondo && !fondo.paused;
    if (fondoIba) fondo.pause();
    cine.classList.add("abierto");
    cine.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    trailer.currentTime = 0;
    trailer.play().catch(() => {});
    cerrar.focus();
  }

  function cerrarCine() {
    trailer.pause();
    cine.classList.remove("abierto");
    cine.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (fondoIba) fondo.play().catch(() => {});
    abrir.focus();
  }

  abrir.addEventListener("click", abrirCine);
  cerrar.addEventListener("click", cerrarCine);
  cine.addEventListener("click", (e) => { if (e.target === cine) cerrarCine(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cine.classList.contains("abierto")) cerrarCine();
  });
})();
