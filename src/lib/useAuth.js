import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseReady } from "./supabase";

/**
 * Maneja la sesión del usuario y a qué hogar pertenece.
 *
 * Un "hogar" es el espacio de datos compartido. Vos y tu pareja pueden
 * estar en el mismo hogar (con un código de invitación) y ven lo mismo.
 * Otra persona, con su propia cuenta, tiene su hogar aparte y no ve
 * absolutamente nada de lo tuyo: eso lo garantiza la base de datos, no
 * la app, así que no alcanza con "adivinar" una URL.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [household, setHousehold] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  // --- Sesión ------------------------------------------------------------
  useEffect(() => {
    if (!supabaseReady) { setChecking(false); return; }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      if (!data.session) setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
      if (!s) { setHousehold(null); setChecking(false); }
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // --- Hogar del usuario -------------------------------------------------
  const loadHousehold = useCallback(async () => {
    if (!supabaseReady || !session) return;
    setError("");
    try {
      const { data: memberships, error: mErr } = await supabase
        .from("household_members")
        .select("household_id")
        .order("joined_at", { ascending: true });
      if (mErr) throw mErr;

      if (!memberships || memberships.length === 0) {
        // Primera vez: le creamos su hogar
        const { data: newId, error: cErr } = await supabase
          .rpc("create_my_household", { household_name: "Mi casa" });
        if (cErr) throw cErr;
        const { data: h } = await supabase
          .from("households").select("*").eq("id", newId).maybeSingle();
        setHousehold(h || { id: newId, name: "Mi casa" });
      } else {
        const id = memberships[0].household_id;
        const { data: h, error: hErr } = await supabase
          .from("households").select("*").eq("id", id).maybeSingle();
        if (hErr) throw hErr;
        setHousehold(h || { id, name: "Mi casa" });
      }
    } catch (e) {
      console.error("No pude cargar el hogar:", e);
      setError(e.message || "No pude cargar tus datos.");
    } finally {
      setChecking(false);
    }
  }, [session]);

  useEffect(() => { if (session) loadHousehold(); }, [session, loadHousehold]);

  // --- Acciones ----------------------------------------------------------
  const signUp = useCallback(async (email, password) => {
    const { data, error: e } = await supabase.auth.signUp({ email, password });
    if (e) throw e;
    // Si el proyecto pide confirmar el mail, no hay sesión todavía
    if (!data.session) return { needsConfirmation: true };
    return { needsConfirmation: false };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) throw e;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setHousehold(null);
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (e) throw e;
  }, []);

  const joinHousehold = useCallback(async (code) => {
    const { data, error: e } = await supabase.rpc("join_household", { code });
    if (e) throw e;
    const { data: h } = await supabase
      .from("households").select("*").eq("id", data).maybeSingle();
    if (h) setHousehold(h);
    return h;
  }, []);

  const renameHousehold = useCallback(async (name) => {
    if (!household) return;
    const { error: e } = await supabase
      .from("households").update({ name }).eq("id", household.id);
    if (e) throw e;
    setHousehold((h) => ({ ...h, name }));
  }, [household]);

  return {
    session,
    user: session ? session.user : null,
    household,
    checking,
    error,
    signUp, signIn, signOut, resetPassword,
    joinHousehold, renameHousehold, reloadHousehold: loadHousehold
  };
}
