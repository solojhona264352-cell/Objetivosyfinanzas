import React, { useState } from "react";
import { Compass, Loader2, LogIn, UserPlus, Mail, Users, Copy, Check, LogOut, X } from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Pantalla de entrada                                                     */
/* ---------------------------------------------------------------------- */

export function AuthScreen({ auth }) {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  function traducirError(e) {
    const m = (e && e.message ? e.message : String(e)).toLowerCase();
    if (m.includes("invalid login")) return "Mail o contraseña incorrectos.";
    if (m.includes("already registered")) return "Ese mail ya tiene cuenta. Probá iniciar sesión.";
    if (m.includes("password should be")) return "La contraseña tiene que tener al menos 6 caracteres.";
    if (m.includes("email not confirmed")) return "Todavía no confirmaste el mail. Revisá tu casilla.";
    if (m.includes("unable to validate email")) return "Ese mail no parece válido.";
    return e && e.message ? e.message : "Algo salió mal. Probá de nuevo.";
  }

  async function submit() {
    setError(""); setInfo("");
    if (!email.trim()) { setError("Escribí tu mail."); return; }
    if (mode !== "reset" && password.length < 6) {
      setError("La contraseña tiene que tener al menos 6 caracteres."); return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await auth.signIn(email.trim(), password);
      } else if (mode === "signup") {
        const r = await auth.signUp(email.trim(), password);
        if (r.needsConfirmation) {
          setInfo("Te mandamos un mail para confirmar la cuenta. Abrilo y volvé acá a iniciar sesión.");
        }
      } else {
        await auth.resetPassword(email.trim());
        setInfo("Te mandamos un mail para cambiar la contraseña.");
      }
    } catch (e) {
      setError(traducirError(e));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  }

  return (
    <div className="los-auth-wrap">
      <div className="los-auth-card">
        <div className="los-auth-brand">
          <Compass size={26} />
          <div>
            <h1>Bitácora</h1>
            <span>Tu casa, tus metas, tu rumbo</span>
          </div>
        </div>

        <div className="los-auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setInfo(""); }}>Entrar</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setInfo(""); }}>Crear cuenta</button>
        </div>

        <label className="los-label">Mail
          <input className="los-input" type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={onKeyDown} placeholder="tumail@ejemplo.com" />
        </label>

        {mode !== "reset" && (
          <label className="los-label">Contraseña
            <input className="los-input" type="password" value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={onKeyDown} placeholder="Mínimo 6 caracteres" />
          </label>
        )}

        {error && <p className="los-error">{error}</p>}
        {info && <p className="los-auth-info">{info}</p>}

        <button className="los-btn los-btn-primary los-auth-submit" onClick={submit} disabled={loading}>
          {loading
            ? <><Loader2 size={16} className="spin" /> Un segundo...</>
            : mode === "login"
              ? <><LogIn size={16} /> Entrar</>
              : mode === "signup"
                ? <><UserPlus size={16} /> Crear mi cuenta</>
                : <><Mail size={16} /> Mandarme el mail</>}
        </button>

        {mode === "login" && (
          <button className="los-link-btn los-auth-link" onClick={() => { setMode("reset"); setError(""); setInfo(""); }}>
            Me olvidé la contraseña
          </button>
        )}
        {mode === "reset" && (
          <button className="los-link-btn los-auth-link" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>
            Volver
          </button>
        )}

        <p className="los-auth-foot">
          Cada cuenta tiene sus propios datos. Si querés compartir la casa con otra persona,
          creá tu cuenta y después pasale el código de invitación desde el menú Cuenta.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Panel de cuenta (invitar, unirse, salir)                                */
/* ---------------------------------------------------------------------- */

export function AccountModal({ auth, onClose }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(auth.household ? auth.household.name : "");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showId, setShowId] = useState(false);

  const invite = auth.household ? auth.household.invite_code : "";

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setError("No pude copiar. Seleccioná el código y copialo a mano.");
    }
  }

  async function unirme() {
    if (!code.trim()) { setError("Pegá el código que te pasaron."); return; }
    setBusy(true); setError(""); setInfo("");
    try {
      await auth.joinHousehold(code.trim());
      setInfo("¡Listo! Ya estás viendo los datos compartidos.");
      setCode("");
    } catch (e) {
      setError(e.message || "No pude sumarte a esa casa.");
    } finally {
      setBusy(false);
    }
  }

  async function guardarNombre() {
    if (!name.trim()) return;
    try { await auth.renameHousehold(name.trim()); } catch (e) { setError(e.message); }
  }

  return (
    <div className="los-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="los-modal">
        <div className="los-modal-head">
          <h3>Cuenta</h3>
          <button className="los-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="los-modal-body">
          <p className="los-plan-hint" style={{ marginBottom: 14 }}>
            Sesión iniciada como <strong>{auth.user ? auth.user.email : ""}</strong>
          </p>

          <label className="los-label">Nombre de la casa
            <input className="los-input" value={name} onChange={(e) => setName(e.target.value)}
              onBlur={guardarNombre} placeholder="Mi casa" />
          </label>

          <h4 className="los-plan-title" style={{ marginTop: 18 }}>Compartir con alguien</h4>
          <p className="los-plan-hint">
            Pasale este código a la persona con la que querés compartir. Que se cree su cuenta,
            entre acá y lo pegue abajo. A partir de ahí ven lo mismo.
          </p>
          <div className="los-invite-box">
            <code>{invite || "—"}</code>
            <button className="los-btn los-btn-ghost" onClick={() => copiar(invite)} disabled={!invite}>
              {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
            </button>
          </div>

          <h4 className="los-plan-title" style={{ marginTop: 18 }}>Sumarme a otra casa</h4>
          <p className="los-plan-hint">
            Si alguien te pasó un código, pegalo acá. Ojo: vas a pasar a ver los datos de esa
            casa, y los tuyos actuales quedan aparte.
          </p>
          <div className="los-add-step">
            <input className="los-input los-input-sm" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="Código de invitación" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); unirme(); } }} />
            <button className="los-btn los-btn-primary" onClick={unirme} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <Users size={15} />} Unirme
            </button>
          </div>

          {error && <p className="los-error">{error}</p>}
          {info && <p className="los-auth-info">{info}</p>}

          <div className="los-card-footer" style={{ marginTop: 20 }}>
            <button className="los-link-btn" onClick={() => setShowId((s) => !s)}>
              {showId ? "Ocultar" : "Datos del hogar"}
            </button>
            <button className="los-btn los-btn-ghost" onClick={auth.signOut}>
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>

          {showId && auth.household && (
            <div className="los-id-box">
              <span>ID del hogar (para migrar datos viejos):</span>
              <code>{auth.household.id}</code>
              <button className="los-link-btn" onClick={() => copiar(auth.household.id)}>Copiar ID</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
