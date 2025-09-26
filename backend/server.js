// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import fetch from "node-fetch"; // si usas Node >=18 puedes quitar esta línea

// ======================
// CONFIG
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
// NONCE GENERATOR (por petición) + CSP header middleware
// ======================
// Genera res.locals.nonce y establece un CSP que NO usa 'unsafe-inline'.
// El frontend puede usar el nonce inyectado por /api/config si necesita inline scripts.
app.use((req, res, next) => {
  // 128-bit random nonce en base64
  res.locals.nonce = crypto.randomBytes(16).toString("base64");

  // Construir el CSP dinámicamente incluyendo el nonce
  const nonce = `'nonce-${res.locals.nonce}'`;
  const csp = [
    `default-src 'self'`,
    // permitimos scripts desde self y hosts de Wompi/CDN; además permitimos inline con nonce
    `script-src 'self' ${nonce} https://checkout.wompi.co https://cdn.wompi.co https://cdn.jsdelivr.net https://unpkg.com`,
    // estilos: permitimos google fonts y self; estilos inline permitidos solo con nonce
    `style-src 'self' ${nonce} https://fonts.googleapis.com https://cdn.jsdelivr.net`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https://cdn-icons-png.flaticon.com https://checkout.wompi.co https://cdn.wompi.co`,
    `connect-src 'self' https://production.wompi.co https://sandbox.wompi.co https://checkout.wompi.co https://api.wompi.co https://api.emailjs.com`,
    `frame-src 'self' https://checkout.wompi.co https://cdn.wompi.co`,
    // bloquear todo lo demás por defecto
  ].join("; ");

  // Establecer header
  res.setHeader("Content-Security-Policy", csp);

  next();
});

// ======================
// Helmet (sin contentSecurityPolicy, porque lo manejamos arriba)
// ======================
app.use(
  helmet({
    // evitar que helmet establezca su propia CSP, ya lo hacemos arriba
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ======================
// RATE LIMIT, PARSERS, CORS
// ======================
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json()); // para la mayoría de APIs
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

// ======================
// SESSIONS
// ======================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret-key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "lax",
    },
  })
);

// ======================
// STATIC FILES (public)
// ======================
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

// ======================
// DB MODELS
// ======================
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error MongoDB:", err));

// ======================
// API - CONFIG
// ======================
// Devuelve publicKey (para frontend), precio y el nonce (si quieres usar scripts inline)
app.get("/api/config", (req, res) => {
  res.json({
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 5000,
    publicKey: process.env.WOMPI_PUBLIC_KEY || "",
    urlSuccess: process.env.URL_SUCCESS || "",
    urlFailure: process.env.URL_FAILURE || "",
    urlPending: process.env.URL_PENDING || "",
    nonce: res.locals.nonce, // opcional: el frontend puede usar este nonce si necesita inline scripts
  });
});

// ======================
// API - TICKETS
// ======================
app.get("/api/tickets/numeros", async (req, res) => {
  try {
    const tickets = await Ticket.find({}, "numeros").lean();
    const ocupados = tickets.flatMap((t) => (t.numeros || []).map((n) => Number(n)));
    const total = 100;
    const numeros = Array.from({ length: total }, (_, i) => {
      const num = i + 1;
      return { numero: num, disponible: !ocupados.includes(num) };
    });
    res.json({ exito: true, numeros });
  } catch (err) {
    console.error("❌ Error cargando números:", err);
    res.status(500).json({ exito: false, mensaje: "Error cargando números" });
  }
});

app.get("/api/tickets/consulta", async (req, res) => {
  try {
    const vendidos = await Ticket.countDocuments();
    const porcentaje = Math.min(100, Math.round((vendidos / 100) * 100));
    res.json({ exito: true, vendidos, porcentaje });
  } catch (err) {
    console.error("❌ Error consulta:", err);
    res.status(500).json({ exito: false, mensaje: "Error consultando" });
  }
});

app.post("/api/tickets/guardar-pendiente", async (req, res) => {
  try {
    const { nombre, correo, telefono, numeros } = req.body;
    if (!nombre || !correo || !telefono || !Array.isArray(numeros) || !numeros.length) {
      return res.status(400).json({ exito: false, mensaje: "Datos incompletos" });
    }
    const reference = `RIFA-${Date.now()}`;
    await Pendiente.create({
      nombre,
      correo,
      telefono,
      numeros: numeros.map((n) => Number(n)),
      reference,
    });
    res.json({ exito: true, reference });
  } catch (err) {
    console.error("❌ Error guardando pendiente:", err);
    res.status(500).json({ exito: false, mensaje: "Error guardando pendiente" });
  }
});

// ======================
// API - SIGNATURE (HMAC-SHA256 con PRIVATE KEY)
// ======================
// Usa la llave privada para firmar: HMAC_SHA256(privateKey, reference + amountInCents + currency)
app.post("/api/signature", (req, res) => {
  try {
    const { reference, amountInCents, currency } = req.body;
    if (!reference || !amountInCents || !currency) {
      return res.status(400).json({ exito: false, mensaje: "Faltan datos para generar la firma" });
    }

    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ exito: false, mensaje: "Falta WOMPI_PRIVATE_KEY" });
    }

    const hmac = crypto.createHmac("sha256", privateKey);
    hmac.update(`${reference}${amountInCents}${currency}`);
    const signature = hmac.digest("hex");

    return res.json({ exito: true, signature });
  } catch (err) {
    console.error("❌ Error generando firma:", err);
    return res.status(500).json({ exito: false, mensaje: "Error interno" });
  }
});

// ======================
// API - CREAR TRANSACCIÓN EN WOMPI (opcional)
// ======================
// Crea la transacción server-side usando la private key (Bearer) y devuelve payment_link
app.post("/api/crear-transaccion", async (req, res) => {
  try {
    const { reference, amountInCents, currency, signature, customer_email } = req.body;

    if (!reference || !amountInCents || !currency || !signature) {
      return res.status(400).json({ exito: false, mensaje: "Faltan datos" });
    }

    const resp = await fetch("https://production.wompi.co/v1/transactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount_in_cents: amountInCents,
        currency,
        customer_email: customer_email || undefined,
        reference,
        signature,
        redirect_url: process.env.URL_SUCCESS,
      }),
    });

    const data = await resp.json();
    console.log("🔗 Respuesta Wompi crear-transaccion:", data);

    // Wompi devuelve payment link en data.data.payment_link o similar (dependiendo versión)
    if (!data?.data?.payment_link) {
      return res.status(500).json({ exito: false, mensaje: "Error creando transacción", detalle: data });
    }

    return res.json({ exito: true, urlCheckout: data.data.payment_link });
  } catch (err) {
    console.error("❌ Error creando transacción:", err);
    res.status(500).json({ exito: false, mensaje: "Error interno" });
  }
});

// ======================
// WEBHOOK WOMPI
// ======================
// Usamos express.raw para leer el body tal cual y verificar integridad
app.post("/webhook-wompi", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const rawBody = req.body.toString("utf8");
    const parsed = JSON.parse(rawBody);
    const { event, data } = parsed;
    if (!data?.transaction) return res.sendStatus(400);

    const tx = data.transaction;

    // Calcular signature de integridad local (usando la INTEGRITY KEY)
    const integrityKey = process.env.WOMPI_INTEGRITY_KEY || "";
    const localSignature = crypto
      .createHash("sha256")
      .update(`${tx.reference}${tx.amount_in_cents}${tx.currency}${integrityKey}`)
      .digest("hex");

    // Wompi puede enviar diferentes headers; revisamos los más comunes
    const headerSignature = req.headers["integrity-signature"] || req.headers["signature"] || req.headers["content-signature"];

    if (headerSignature && localSignature && headerSignature !== localSignature) {
      console.warn("⚠️ Firma de integridad no coincide (webhook). Esperado:", localSignature, "Recibido:", headerSignature);
      return res.sendStatus(403);
    }

    // Procesar evento cuando la transacción está aprobada
    if (event === "transaction.updated" && tx.status === "APPROVED") {
      const pendiente = await Pendiente.findOne({ reference: tx.reference });
      if (pendiente) {
        await Ticket.create({
          reference: tx.reference,
          correo: tx.customer_email || pendiente.correo,
          nombre: tx.customer_name || pendiente.nombre,
          telefono: pendiente.telefono,
          numeros: pendiente.numeros,
          estadoPago: "pagado",
        });
        await pendiente.deleteOne();
        console.log(`🎟️ Ticket confirmado y pagado: ${tx.reference}`);
        // Aquí podrías disparar un envío de correo
      } else {
        console.log(`ℹ️ Transacción aprobada pero no existe pendiente con reference ${tx.reference}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

// ======================
// START SERVER
// ======================
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
