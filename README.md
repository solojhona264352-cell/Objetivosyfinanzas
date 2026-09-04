# Bitácora

App para llevar metas, hábitos, retos, tareas y la economía de la casa.
Pensada para dos o más personas: cada uno tiene su perfil con sus cosas
personales, y las finanzas del hogar son una sola, compartida.

Stack: **React + Vite** (frontend) · **Supabase** (base de datos y tiempo real) · **Vercel** (hosting + función serverless para la IA).

---

## Qué hace

- **Perfiles**: Jhona, Katy, los que quieras. Cada uno ve sus metas y hábitos.
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
VITE_WORKSPACE_ID=casa
```

> `VITE_WORKSPACE_ID` es el identificador de tu casa. Todos los dispositivos
> que usen el mismo valor comparten los datos. Dejá `casa` si no te importa.

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
| `VITE_WORKSPACE_ID` | `casa` | identificar tu hogar |
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

El `schema.sql` deja activa una política **abierta**: cualquiera con la URL y
la anon key puede leer y escribir. Es lo más simple y funciona bien para uso
familiar, **pero no publiques la URL de tu app**.

Si querés cerrarlo de verdad, en `supabase/schema.sql` está comentada la
**Opción B**: exige usuario logueado. Para activarla hay que prender el login
por email en Supabase (**Authentication → Providers**) y agregar una pantalla
de login. Avisame si querés que la agregue.

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
Verificá que el paso 3 del `schema.sql` (el bloque de tiempo real) haya
corrido bien, y que ambos dispositivos usen el mismo `VITE_WORKSPACE_ID`.
