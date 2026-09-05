import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, supabaseReady, CLIENT_ID } from "./supabase";



/**
 * Mantiene un estado sincronizado con Supabase en tiempo real.
 *
 * Cómo funciona:
 *  - Al abrir, lee la fila del workspace y la muestra.
 *  - Cada cambio local se guarda con un pequeño retraso (debounce) para no
 *    escribir en cada tecla.
 *  - Se suscribe a los cambios de la tabla: si el otro dispositivo guarda,
 *    llega solo y se aplica, salvo que justo estemos escribiendo nosotros.
 *  - Siempre deja una copia en localStorage, así la app funciona aunque
 *    se caiga internet o falten las variables de entorno.
 *
 * Nota honesta: el que guarda último gana. Para dos personas usando la app
 * en momentos distintos alcanza de sobra. Si ambos editan exactamente el
 * mismo dato en el mismo segundo, prevalece el último en guardar.
 */
export function useCloudState(initialValue, workspaceId) {
  const LOCAL_KEY = `bitacora:${workspaceId || "sin-hogar"}`;
  const [state, setState] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState(supabaseReady ? "conectando" : "local");

  const pendingRef = useRef(false);   // hay cambios locales sin guardar
  const timerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Carga inicial ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Copia local primero, para que la app abra instantánea
      try {
        const cached = localStorage.getItem(LOCAL_KEY);
        if (cached && !cancelled) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") setState(parsed);
        }
      } catch (e) {
        /* copia local corrupta: se ignora */
      }

      // 2) Después, lo que haya en la nube (manda esto)
      if (supabaseReady && workspaceId) {
        try {
          const { data, error } = await supabase
            .from("bitacora_state")
            .select("data")
            .eq("id", workspaceId)
            .maybeSingle();

          if (error) throw error;

          if (!cancelled) {
            if (data && data.data && Object.keys(data.data).length > 0) {
              setState(data.data);
              try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data.data)); } catch (e) {}
            }
            setStatus("en línea");
          }
        } catch (err) {
          console.error("Bitácora: no pude leer de Supabase", err);
          if (!cancelled) setStatus("sin conexión");
        }
      }

      if (!cancelled) setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [workspaceId]);

  // ---- Escucha de cambios del otro dispositivo --------------------------
  useEffect(() => {
    if (!supabaseReady || !workspaceId) return;

    const channel = supabase
      .channel(`bitacora-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bitacora_state",
          filter: `id=eq.${workspaceId}`
        },
        (payload) => {
          const row = payload.new;
          if (!row || !row.data) return;
          // Ignoramos el eco de nuestros propios cambios
          if (row.updated_by === CLIENT_ID) return;
          // Si estamos con cambios sin guardar, no pisamos lo del usuario
          if (pendingRef.current) return;

          setState(row.data);
          try { localStorage.setItem(LOCAL_KEY, JSON.stringify(row.data)); } catch (e) {}
        }
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("en línea");
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("sin conexión");
      });

    return () => { supabase.removeChannel(channel); };
  }, [workspaceId]);

  // ---- Guardado (local siempre, nube con debounce) ----------------------
  useEffect(() => {
    if (!loaded) return;

    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(state)); } catch (e) {}

    if (!supabaseReady || !workspaceId) return;

    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        setStatus("guardando");
        const { error } = await supabase
          .from("bitacora_state")
          .upsert(
            { id: workspaceId, data: stateRef.current, updated_by: CLIENT_ID },
            { onConflict: "id" }
          );
        if (error) throw error;
        setStatus("en línea");
      } catch (err) {
        console.error("Bitácora: no pude guardar en Supabase", err);
        setStatus("sin conexión");
      } finally {
        pendingRef.current = false;
      }
    }, 600);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, loaded, workspaceId]);

  const update = useCallback((updater) => {
    setState((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  return { state, setState: update, loaded, status };
}
