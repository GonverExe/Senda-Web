// index.js - portada: enlace de Steam

(function () {
  "use strict";

  const config = window.SENDA || {};
  document.querySelectorAll("[data-steam]").forEach((enlace) => {
    if (config.steam) enlace.href = config.steam;
  });
})();
