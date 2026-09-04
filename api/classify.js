/**
 * Función serverless de Vercel.
 *
 * Por qué existe: la clave de Anthropic NUNCA puede estar en el navegador,
 * porque cualquiera podría verla y gastar tu crédito. El navegador le pide
 * a esta función, y esta función —que corre en el servidor de Vercel— es la
 * única que conoce la clave.
 *
 * Variable de entorno necesaria en Vercel: ANTHROPIC_API_KEY
 */

const EXPENSE_CATS = [
  "Alquiler / hipoteca", "Supermercado", "Servicios (luz, agua, gas, internet)",
  "Transporte", "Salud", "Educación", "Entretenimiento", "Ropa",
  "Ahorro / Objetivo", "Otros gastos"
];
const INCOME_CATS = ["Sueldo", "Freelance / changas", "Alquileres", "Otros ingresos"];

const SYSTEM_PROMPT = `Sos un clasificador de gastos e ingresos domésticos para una app en español (Uruguay).
Vas a recibir texto libre e informal (notas sueltas de un teléfono) y/o imágenes de facturas, tickets, capturas de pantalla de chats, transferencias o resúmenes bancarios.
Extraé de ahí todos los gastos e ingresos que encuentres.

Devolvé ÚNICAMENTE un JSON array (sin texto adicional, sin explicaciones, sin backticks de markdown), con esta forma exacta:
[{"amount": number, "type": "expense" | "income", "category": string, "description": string, "date": string | null}]

Reglas:
- "amount": el monto en números, sin símbolos de moneda ni separadores de miles.
- "type": "income" solo si claramente es un ingreso (sueldo, cobro, venta, transferencia recibida). Si hay duda, "expense".
- "category": tiene que ser EXACTAMENTE uno de estos valores, según el tipo:
  Gastos: ${JSON.stringify(EXPENSE_CATS)}
  Ingresos: ${JSON.stringify(INCOME_CATS)}
  Si no encaja claramente, usá "Otros gastos" u "Otros ingresos" según corresponda.
- "description": descripción corta basada en lo que veas (ej: "nafta", "almacén", "sueldo de agosto"). Si es una factura de un comercio, usá el nombre del comercio.
- "date": si la imagen o el texto muestran una fecha clara, devolvela en formato "AAAA-MM-DD". Si no hay fecha visible, devolvé null.
- En una factura o ticket, priorizá el TOTAL de la compra como un solo ítem, salvo que el usuario claramente quiera el detalle por producto.
- Si una imagen no tiene ningún gasto ni ingreso legible, no inventes nada: simplemente no la incluyas.
- No agregues comentarios ni texto fuera del JSON.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Usá POST" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel."
    });
  }

  try {
    const { text, images } = req.body || {};

    if ((!text || !text.trim()) && (!images || images.length === 0)) {
      return res.status(400).json({ error: "Mandá texto o al menos una imagen." });
    }

    const content = [];
    (images || []).slice(0, 4).forEach((img) => {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data }
      });
    });
    content.push({
      type: "text",
      text: text && text.trim()
        ? text.trim()
        : "Extraé los gastos e ingresos que aparezcan en las imágenes adjuntas."
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Anthropic respondió con error:", response.status, detail);
      return res.status(502).json({ error: "La IA no pudo procesar el pedido." });
    }

    const data = await response.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let items;
    try {
      items = JSON.parse(raw);
    } catch (e) {
      console.error("No pude parsear la respuesta de la IA:", raw.slice(0, 500));
      return res.status(502).json({ error: "La IA devolvió algo que no pude interpretar." });
    }

    if (!Array.isArray(items)) {
      return res.status(502).json({ error: "Formato inesperado." });
    }

    return res.status(200).json({ items });
  } catch (err) {
    console.error("Error en /api/classify:", err);
    return res.status(500).json({ error: "Error inesperado en el servidor." });
  }
}
