// config.js - enlaces y claves de la web

window.SENDA = {
  // página del juego en Steam
  steam: "https://store.steampowered.com/",

  // historial de actualizaciones. La clave es la pública ("publishable"/"anon"):
  // solo deja leer. Nunca pongas aquí la "secret" ni la "service_role".
  supabase: {
    url: "https://tllzmxkocgawznjvhwfu.supabase.co",
    clave: "sb_publishable_UVA6pbD3WHIX68k_FO3aEg_YmIQg_TL",
    tabla: "actualizaciones",
  },
};
