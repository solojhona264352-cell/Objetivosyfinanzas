# Bitácora

App para llevar metas, hábitos, retos, tareas y la economía de la casa.
Pensada para dos o más personas: cada uno tiene su perfil con sus cosas
personales, y las finanzas del hogar son una sola, compartida.

Stack: **React + Vite** (frontend) · **Supabase** (base de datos y tiempo real) · **Vercel** (hosting + función serverless para la IA).

---

## Qué hace

- **Cuentas con login**: cada persona se registra con su mail y contraseña. Los datos de una cuenta son invisibles para las demás (lo garantiza la base de datos, no la app).
- **Casas compartidas**: si querés compartir con tu pareja, le pasás un código de invitación y pasan a ver lo mismo.
- **Perfiles dentro de la casa**: Jhona, Katy, los que quieras. Cada uno ve sus metas y hábitos.
- **Compartido**: al crear una meta, hábito o reto podés marcarlo como compartido y lo ven todos.
- **Finanzas únicas**: los movimientos son de la casa. Si vos cargás el arroz, ella lo ve al instante.
- **Tiempo real**: cambios sincronizados entre dispositivos sin recargar.
- **IA**: pegás texto suelto o subís una foto de una factura y te la clasifica sola.
- **Funciona sin internet**: guarda local y sube los cambios al reconectar.

---

## Puesta en marcha (unos 15 minutos)

### 1. Instalar

```bash
npm install
```

### 2. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (el plan gratis alcanza).
2. Andá a **SQL Editor → New query**.
3. Copiá y pegá **todo** el contenido de `supabase/schema.sql` y dale **Run**.
4. Andá a **Project Settings → API** y copiá dos cosas:
   - **Project URL**
   - **anon public** (la clave larga)

### 3. Configurar las variables

```bash
cp .env.example .env
```

Abrí `.env` y completá:

```
VITE_SUPABASE_URL=https://tuproyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> Ya no hace falta `VITE_WORKSPACE_ID`: ahora cada usuario tiene su casa
> propia, creada automáticamente al registrarse.

### 2.b Activar el login por mail

En Supabase, andá a **Authentication → Sign In / Providers** y verificá que
**Email** esté habilitado. Si no querés tener que confirmar el mail cada vez
que creás una cuenta, desactivá ahí la opción **Confirm email**.

### 4. Probar en tu máquina

```bash
npm run dev
```

Abrí http://localhost:5173. Abajo de todo tiene que decir **"Sincronizado"**.
Si abrís la misma URL en otra pestaña y creás una meta, aparece en la otra sola.

---

## Subirlo a Vercel

### 1. Subir el código a GitHub

```bash
git init
git add .
git commit -m "Bitácora"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/bitacora.git
git push -u origin main
```

### 2. Importar en Vercel

1. Entrá a [vercel.com](https://vercel.com) → **Add New → Project** → elegí el repo.
2. Vercel detecta Vite solo. No cambies nada de la configuración de build.
3. Antes de dar Deploy, abrí **Environment Variables** y cargá:

| Nombre | Valor | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL` | tu Project URL | conectar con la base |
| `VITE_SUPABASE_ANON_KEY` | tu anon key | conectar con la base |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | que funcione la IA |

4. **Deploy**.

> **Importante**: `ANTHROPIC_API_KEY` **no** lleva el prefijo `VITE_`.
> Ese prefijo hace que la variable se incluya en el código que baja al
> navegador, y ahí cualquiera podría leer tu clave y gastar tu crédito.
> Sin el prefijo, la clave vive solo en el servidor, que es donde tiene que estar.

### 3. Usarlo desde el celular

Abrí la URL de Vercel en el celular y agregala a la pantalla de inicio
("Añadir a inicio" en iOS, "Instalar app" en Android). Se ve como una app.

---

## Estructura del proyecto

```
bitacora/
├── api/
│   └── classify.js          Función serverless: habla con Anthropic
│                            (acá vive la API key, nunca en el navegador)
├── public/
├── src/
│   ├── lib/
│   │   ├── supabase.js      Cliente de Supabase
│   │   └── useCloudState.js Sincronización en tiempo real + respaldo local
│   ├── App.jsx              Toda la app
│   ├── main.jsx             Punto de entrada
│   └── index.css            Reset mínimo
├── supabase/
│   └── schema.sql           Tablas, tiempo real y permisos
├── .env.example
└── package.json
```

---

## Cómo compartir la app con alguien

**Si querés compartir tu casa** (por ejemplo con tu pareja, para llevar las
finanzas juntos): entrá al menú **Cuenta** (el ícono de persona, arriba a la
derecha), copiá el **código de invitación** y pasáselo. La otra persona se
crea su cuenta, entra a Cuenta, pega el código y toca "Unirme". A partir de
ahí ven exactamente lo mismo.

**Si querés que use la app pero con sus datos aparte**: pasale solo la URL.
Se registra con su mail y listo — tiene su propia casa, y no ve nada de lo
tuyo ni vos de lo suyo.

---

## Cómo se guardan los datos

Todo el estado (perfiles, metas, hábitos, finanzas) se guarda como **un único
documento JSON** en la tabla `bitacora_state`, en la fila de tu workspace.

**Por qué así y no con muchas tablas**: es mucho más simple de mantener, hace
que sumar campos nuevos no requiera migraciones, y para una app familiar el
rendimiento es idéntico. Si algún día son 20 personas o querés hacer consultas
SQL sobre los gastos, ahí conviene pasar a tablas separadas.

**Lo que tenés que saber**: gana el último que guarda. Si vos y Katy editan
**el mismo dato en el mismo segundo**, queda el último. En el uso normal
(uno carga un gasto, la otra marca un hábito) no pasa nunca, porque los
cambios llegan al instante por el canal de tiempo real.

---

## Seguridad

El aislamiento entre cuentas está hecho con **Row Level Security** de Postgres:
las políticas del `schema.sql` hacen que cada consulta solo pueda tocar filas
de los hogares donde el usuario es miembro. No es una validación de la interfaz
que se pueda saltear tocando la URL o abriendo la consola del navegador: la
base de datos directamente no devuelve esos datos.

La `anon key` es pública por diseño (viaja al navegador en cualquier app de
Supabase); lo que protege los datos son las políticas, no esa clave.

---

## Problemas comunes

**Abajo dice "Modo local (falta configurar Supabase)"**
Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`. En local, revisá el
`.env` y reiniciá `npm run dev` (Vite solo lee el .env al arrancar). En Vercel,
cargá las variables y volvé a hacer deploy.

**Dice "Sin conexión" aunque tengas internet**
Casi siempre es que no corriste el `schema.sql`, o que el `VITE_WORKSPACE_ID`
no coincide con la fila que se creó. Abrí la consola del navegador (F12) para
ver el error concreto.

**La IA tira error**
Falta `ANTHROPIC_API_KEY` en Vercel, o está escrita con el prefijo `VITE_`.
Fijate en Vercel → tu proyecto → **Logs** para ver el error real.
Ojo: `/api/classify` **no funciona con `npm run dev`** de Vite. Para probar la
IA localmente usá `vercel dev` (con el CLI de Vercel instalado), o probala
directo en el deploy.

**Los cambios no llegan al otro dispositivo**
Verificá que el bloque de tiempo real del `schema.sql` haya corrido bien, y
que ambas personas estén en la misma casa (mismo código de invitación).

**"No pude cargar tu casa"**
Suele ser que el `schema.sql` nuevo no se ejecutó completo. Corrélo otra vez:
está escrito para poder repetirse sin romper nada.

**Al registrarme no pasa nada**
Si en Supabase está activo "Confirm email", primero tenés que abrir el mail de
confirmación. Podés desactivarlo en Authentication → Sign In / Providers → Email.
