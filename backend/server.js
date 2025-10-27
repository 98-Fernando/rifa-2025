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
config();

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_PATH = path.join(__dirname, "..", "public");
const BASE_URL = process.env.BASE_URL || "https://rifa-2025.onrender.com";

// ==================== MERCADO PAGO ====================
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error("❌ Falta MP_ACCESS_TOKEN en el archivo .env");
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
      return res.status(400).json({
        exito: false,
        mensaje: "Faltan datos para generar el pago",
      });
    }

    const pendiente = await Pendiente.findOne({ reference });
    if (!pendiente) {
      return res.status(404).json({
        exito: false,
        mensaje: "No se encontró la reserva asociada.",
      });
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
        success: `${BASE_URL}/verificar-pago.html?ref=${reference}`,
        failure: `${BASE_URL}/verificar-pago.html?ref=${reference}`,
        pending: `${BASE_URL}/verificar-pago.html?ref=${reference}`,
      },
      notification_url: `${BASE_URL}/api/mercadopago/webhook`,
    };

    const result = await mpPreference.create({ body: preference });
    console.log(`✅ Preferencia creada: ${reference}`);
    res.json({ exito: true, init_point: result.init_point });
  } catch (err) {
    console.error("Error creando preferencia:", err);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al generar la preferencia de pago",
      error: err.message,
    });
  }
});

// ==================== WEBHOOK MERCADO PAGO ====================
app.post("/api/mercadopago/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const { query, body } = req;
    const type = body.type || body.topic || query.topic || "sin_tipo";
    const id = body.data?.id || query.id;
    const resource = body.resource;

    console.log("📩 Webhook recibido:", JSON.stringify({ query, body }, null, 2));

    await WebhookLog.create({
      type,
      paymentId: id || "sin-id",
      rawBody: body,
    });

    if (!id && !resource) {
      console.log("Webhook sin ID ni resource válido.");
      return;
    }

    let paymentData = null;
    let reference = null;

    // Caso 1: Webhook de pago directo
    if (type.includes("payment")) {
      try {
        const pago = await mpPayment.get({ id });
        paymentData = pago;
        reference = pago.external_reference;
        console.log(`💰 Pago directo (${reference}) estado: ${pago.status}`);
      } catch (err) {
        console.error("Error obteniendo pago directo:", err.message);
        return;
      }
    }

    // Caso 2: Webhook de merchant_order
    if (type.includes("merchant_order")) {
      const url =
        resource || `https://api.mercadolibre.com/merchant_orders/${id}`;
      console.log("🔍 Consultando merchant_order:", url);

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!resp.ok) {
        console.error(
          `Error consultando merchant_order (${resp.status}):`,
          await resp.text()
        );
        return;
      }

      const orderData = await resp.json();
      const pagoAprobado = orderData.payments?.find(
        (p) => p.status === "approved"
      );

      if (pagoAprobado) {
        paymentData = await mpPayment.get({ id: pagoAprobado.id });
        reference =
          paymentData.external_reference || orderData.external_reference;
        console.log(`✅ Orden con pago aprobado (${reference})`);
      } else {
        console.log("Orden sin pago aprobado aún.");
        return;
      }
    }

    if (!paymentData || !reference) {
      console.log("Webhook sin datos de pago válidos.");
      return;
    }

    if (paymentData.status !== "approved") {
      console.log(`⏳ Pago aún no aprobado (${paymentData.status})`);
      return;
    }

    const monto = Number(paymentData.transaction_amount) || 0;
    const fecha = new Date().toLocaleString("es-CO", {
      timeZone: "America/Bogota",
    });
    const idPagoMP = paymentData.id;
    const metodoPago = paymentData.payment_method_id || "desconocido";

    console.log(`💵 Pago aprobado: ${monto} COP (${metodoPago})`);

    let pendiente = await Pendiente.findOne({ reference });
    if (!pendiente) {
      console.warn(`⚠️ Pendiente no encontrado para ${reference}, reintentando...`);
      await new Promise((r) => setTimeout(r, 2000));
      pendiente = await Pendiente.findOne({ reference });
    }

    if (!pendiente) {
      console.log(`No se encontró registro pendiente para ${reference}`);
      return;
    }

    await Ticket.create({
      reference: pendiente.reference,
      nombre: pendiente.nombre,
      correo: pendiente.correo,
      telefono: pendiente.telefono,
      numeros: pendiente.numeros,
      monto,
      fecha,
      estadoPago: "pagado",
      idPagoMP,
      metodoPago,
    });

    await Pendiente.findByIdAndDelete(pendiente._id);

    await enviarCorreo(
      pendiente.correo,
      "Pago confirmado - Rifa 2025",
      `
        <h2>¡Gracias, ${pendiente.nombre}!</h2>
        <p>Tu pago fue aprobado y tus números quedaron registrados correctamente:</p>
        <h3>${pendiente.numeros.join(", ")}</h3>
        <p><b>Monto:</b> $${monto.toLocaleString("es-CO")} COP</p>
        <p><b>Método:</b> ${metodoPago}</p>
        <p>Fecha: ${fecha}</p>
        <hr>
        <p>¡Mucha suerte en el sorteo!</p>
      `
    );

    console.log(`🎟️ Ticket ${reference} confirmado y correo enviado a ${pendiente.correo}`);
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    await WebhookLog.create({
      type: "error",
      paymentId: "sin-id",
      rawBody: { mensaje: error.message, stack: error.stack },
    });
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
    console.error("Error al obtener webhooks:", err);
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
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    skip: (req) => req.originalUrl.includes("/api/mercadopago/webhook"),
  })
);

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
  console.log(`🌐 URL: ${BASE_URL}`);
});
