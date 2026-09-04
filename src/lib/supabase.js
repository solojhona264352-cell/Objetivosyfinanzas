import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID || "casa";

// Si faltan las variables, la app igual arranca y trabaja solo en este
// dispositivo (guardando en localStorage). Así nunca queda una pantalla
// en blanco por un .env mal configurado.
export const supabaseReady = Boolean(url && anonKey);

export const supabase = supabaseReady
  ? createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 5 } }
    })
  : null;

// Identificador de esta pestaña/dispositivo, para ignorar los ecos
// de nuestros propios cambios cuando vuelven por el canal de tiempo real.
export const CLIENT_ID =
  Math.random().toString(36).slice(2) + Date.now().toString(36);
