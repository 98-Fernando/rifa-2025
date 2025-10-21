// ==================== IMPORTACIONES ====================
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
import fetch from "node-fetch";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import WebhookLog from "./models/WebhookLog.js";
import ticketsRouter from "./routes/tickets.js";
import adminApiRouter from "./routes/admin.js";
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";
import { enviarCorreo } from "./emailService.js";

// ==================== CONFIGURACIÓN BASE ====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_PATH = path.join(__dirname, "..", "public");

// ==================== MERCADO PAGO ====================
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error("❌ ERROR: Falta MP_ACCESS_TOKEN en .env");
  process.exit(1);
}

const mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const mpPreference = new Preference(mpClient);
const mpPayment = new Payment(mpClient);

// ==================== MIDDLEWARES ====================
app.use(express.json({ type: "*/*" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: [
      "https://rifa-2025.onrender.com",
      "http://localhost:5000",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
  })
);

// ==================== SESIONES ====================
app.set("trust proxy", 1);
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
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// ==================== BASE DE DATOS ====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error en MongoDB:", err));

// ==================== AUTH ADMIN ====================
const isAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect("/login.html");
};

// ==================== CONFIG API ====================
app.get("/api/config", (req, res) => {
  res.json({
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 100,
  });
});

// ==================== CREAR PREFERENCIA MERCADO PAGO ====================
app.post("/api/mercadopago/preference", async (req, res) => {
  try {
    const { reference, monto } = req.body;

    if (!reference || !monto) {
      return res
        .status(400)
        .json({ exito: false, mensaje: "Faltan datos para generar el pago" });
    }

    const pendiente = await Pendiente.findOne({ reference });
    if (!pendiente) {
      return res
        .status(404)
        .json({ exito: false, mensaje: "No se encontró la reserva asociada." });
    }

    const preference = {
      items: [
        {
          id: reference,
          title: `Tickets de Rifa - Ref: ${reference}`,
          quantity: 1,
          unit_price: Number(monto),
          currency_id: "COP",
        },
      ],
      payer: {
        name: pendiente.nombre,
        email: pendiente.correo,
        phone: { number: pendiente.telefono },
      },
      external_reference: reference,
      auto_return: "approved",
      back_urls: {
        success: process.env.URL_SUCCESS,
        failure: process.env.URL_FAILURE,
        pending: process.env.URL_PENDING,
      },
      notification_url:
        "https://rifa-2025.onrender.com/api/mercadopago/webhook",
    };

    const result = await mpPreference.create({ body: preference });

    console.log(`🧾 Preferencia creada correctamente: ${reference}`);
    res.json({ exito: true, init_point: result.init_point });
  } catch (err) {
    console.error("❌ Error creando preferencia Mercado Pago:", err);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al generar la preferencia de pago",
      error: err.message,
    });
  }
});

// ==================== WEBHOOK MERCADO PAGO ====================
// ==================== WEBHOOK MERCADO PAGO ====================
app.post("/api/mercadopago/webhook", async (req, res) => {
  try {
    console.log("📦 Webhook recibido:", JSON.stringify(req.body, null, 2));

    const { type, action, data, topic, resource } = req.body;
    const evento = type || topic || action || "sin_tipo";

    await WebhookLog.create({
      type: evento,
      paymentId: data?.id || "sin-id",
      rawBody: req.body,
    });

    let paymentData = null;
    let reference = null;

    // 🔹 Caso 1: Mercado Pago envía "payment"
    if (evento === "payment" && data?.id) {
      paymentData = await mpPayment.get({ id: data.id });
      reference = paymentData.external_reference;
      console.log(`💳 Webhook de pago directo recibido: ${reference}`);
    }

    // 🔹 Caso 2: Mercado Pago envía "merchant_order"
    if (evento === "merchant_order" && resource) {
      console.log("📄 Consultando merchant_order:", resource);
      const resp = await fetch(resource, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      const orderData = await resp.json();

      const pagoAprobado = orderData.payments?.find(
        (p) => p.status === "approved" || p.status === "pending"
      );

      if (!pagoAprobado) {
        console.log("⏳ Orden sin pago aprobado aún.");
        return res.sendStatus(200);
      }

      paymentData = await mpPayment.get({ id: pagoAprobado.id });
      reference = paymentData.external_reference;
    }

    if (!paymentData || !reference) {
      console.log("⚠️ Webhook sin información de pago válida.");
      return res.sendStatus(200);
    }

    console.log(`💰 Estado actual del pago (${reference}): ${paymentData.status}`);

    // 🔁 Si aún está pendiente, esperamos y reconsultamos una vez
    if (paymentData.status === "pending") {
      console.log("⏳ Esperando confirmación del pago...");
      await new Promise((resolve) => setTimeout(resolve, 4000)); // 4 segundos
      const refreshed = await mpPayment.get({ id: paymentData.id });
      paymentData = refreshed;
      console.log(`🔄 Estado actualizado (${reference}): ${paymentData.status}`);
    }

    // 🔹 Si ya está aprobado, procedemos
    if (paymentData.status === "approved") {
      const pendiente = await Pendiente.findOne({ reference });
      if (!pendiente) {
        console.warn("⚠️ Pendiente no encontrado:", reference);
        return res.sendStatus(200);
      }

      await Ticket.create({
        reference: pendiente.reference,
        nombre: pendiente.nombre,
        correo: pendiente.correo,
        telefono: pendiente.telefono,
        numeros: pendiente.numeros,
        estadoPago: "pagado",
      });

      await enviarCorreo(
        pendiente.correo,
        "✅ Pago confirmado - Rifa 2025",
        `
          <h2>¡Gracias ${pendiente.nombre}! 🎉</h2>
          <p>Tu pago ha sido confirmado y tus números ya están activos:</p>
          <h3>${pendiente.numeros.join(", ")}</h3>
          <p><b>Referencia:</b> ${pendiente.reference}</p>
          <p>🍀 ¡Mucha suerte y gracias por participar!</p>
        `
      );

      await Pendiente.deleteOne({ _id: pendiente._id });
      console.log(`✅ Ticket creado y pendiente eliminado: ${reference}`);
    } else {
      console.log(`⚠️ Pago aún no aprobado (${paymentData.status}).`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error procesando webhook:", err);
    res.sendStatus(500);
  }
});

// ==================== RUTA ADMIN: LOGS WEBHOOK ====================
app.get("/api/admin/webhooks", async (req, res) => {
  try {
    if (!req.session?.isAdmin) {
      return res.status(401).json({ exito: false, mensaje: "No autorizado" });
    }

    const { page = 1, limit = 50, q = "" } = req.query;
    const skip = (page - 1) * limit;

    const query = q
      ? {
          $or: [
            { reference: { $regex: q, $options: "i" } },
            { status: { $regex: q, $options: "i" } },
            { type: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const total = await WebhookLog.countDocuments(query);
    const logs = await WebhookLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      exito: true,
      total,
      pagina: Number(page),
      limite: Number(limit),
      logs,
    });
  } catch (err) {
    console.error("❌ Error al obtener webhooks:", err);
    res.status(500).json({ exito: false, mensaje: "Error del servidor" });
  }
});

// ==================== LOGIN ADMIN ====================
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, mensaje: "Credenciales inválidas" });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() =>
    res.json({ exito: true, mensaje: "Sesión cerrada correctamente" })
  );
});

// ==================== RUTAS ADMIN ====================
app.get("/admin", (req, res) => {
  if (req.session.isAdmin) return res.redirect("/admin.html");
  res.sendFile(path.join(PUBLIC_PATH, "login.html"));
});
app.get("/admin.html", isAdmin, (req, res) => {
  res.sendFile(path.join(PUBLIC_PATH, "admin.html"));
});

// ==================== RUTAS PRINCIPALES ====================
app.use("/api/tickets", ticketsRouter);
app.use("/api/admin", adminApiRouter);

// ==================== SEGURIDAD Y CABECERAS ====================
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://cdn-icons-png.flaticon.com https://www.mercadopago.com",
    "connect-src 'self' https://api.mercadopago.com https://api.mercadolibre.com https://rifa-2025.onrender.com",
    "frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com",
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ==================== ARCHIVOS ESTÁTICOS ====================
app.use(express.static(PUBLIC_PATH));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_PATH, "index.html")));

// ==================== ERROR 404 ====================
app.use((req, res) => {
  res.status(404).json({ exito: false, mensaje: "Ruta no encontrada" });
});

// ==================== INICIO SERVIDOR ====================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: https://rifa-2025.onrender.com`);
});
