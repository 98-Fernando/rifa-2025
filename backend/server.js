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

// ======================
// CONFIGURACIÓN BASE
// ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// ======================
// VALIDAR VARIABLES ENTORNO
// ======================
if (!process.env.MONGO_URI) throw new Error("❌ MONGO_URI no definida en .env");
if (!process.env.WOMPI_PUBLIC_KEY) throw new Error("❌ WOMPI_PUBLIC_KEY no definida en .env");
if (!process.env.WOMPI_INTEGRITY_KEY) console.warn("⚠️ WOMPI_INTEGRITY_KEY no definida — el webhook no validará firmas");

// ======================
// MIDDLEWARES
// ======================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://checkout.wompi.co",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com"],
        connectSrc: [
          "'self'",
          "https://production.wompi.co",
          "https://checkout.wompi.co",
          "https://api.emailjs.com",
        ],
        frameSrc: ["'self'", "https://checkout.wompi.co"],
      },
    },
  })
);

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

// ======================
// SESIONES
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
// ARCHIVOS ESTÁTICOS
// ======================
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

// ======================
// DB - MODELOS
// ======================
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error MongoDB:", err));

// ======================
// API CONFIG
// ======================
app.get("/api/config", (req, res) => {
  res.json({
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 5000,
    publicKey: process.env.WOMPI_PUBLIC_KEY,
  });
});

// ======================
// API TICKETS
// ======================
app.get("/api/tickets/numeros", async (req, res) => {
  try {
    const tickets = await Ticket.find({}, { numeros: 1, _id: 0 });
    const ocupados = tickets.flatMap((t) => t.numeros || []);
    const numeros = Array.from({ length: 100 }, (_, i) => i + 1).map((n) => ({
      numero: n,
      disponible: !ocupados.includes(n),
    }));
    res.json({ exito: true, numeros });
  } catch (err) {
    res.status(500).json({ exito: false, mensaje: "Error al cargar números" });
  }
});

app.get("/api/tickets/consulta", async (req, res) => {
  try {
    const totalTickets = await Ticket.countDocuments();
    const porcentaje = Math.min(100, Math.round((totalTickets / 100) * 100));
    res.json({ exito: true, porcentaje });
  } catch {
    res.status(500).json({ exito: false });
  }
});

app.post("/api/tickets/guardar-pendiente", async (req, res) => {
  try {
    const { nombre, correo, telefono, numeros } = req.body;
    if (!nombre || !correo || !telefono || !Array.isArray(numeros) || numeros.length === 0) {
      return res.status(400).json({ exito: false, mensaje: "Datos incompletos" });
    }

    // 🚀 Validación extra: evitar duplicados
    const tickets = await Ticket.find({}, { numeros: 1, _id: 0 });
    const ocupados = tickets.flatMap((t) => t.numeros || []);
    if (numeros.some((n) => ocupados.includes(n))) {
      return res.status(400).json({ exito: false, mensaje: "Algunos números ya están ocupados." });
    }

    const reference = `ticket_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await Pendiente.create({ reference, nombre, correo, telefono, numeros });
    res.json({ exito: true, reference });
  } catch {
    res.status(500).json({ exito: false, mensaje: "Error guardando pendiente" });
  }
});

// ======================
// API - GENERAR FIRMA PARA WOMPI
// ======================
app.post("/api/signature", (req, res) => {
  try {
    const { reference, amountInCents, currency } = req.body;

    if (!reference || !amountInCents || !currency) {
      return res.status(400).json({ error: "Faltan datos para generar la firma" });
    }

    const integrityKey = process.env.WOMPI_INTEGRITY_KEY;
    if (!integrityKey) {
      return res.status(500).json({ error: "Falta WOMPI_INTEGRITY_KEY en el servidor" });
    }

    const signature = crypto
      .createHash("sha256")
      .update(`${reference}${amountInCents}${currency}${integrityKey}`)
      .digest("hex");

    res.json({ signature });
  } catch (err) {
    console.error("❌ Error generando firma:", err);
    res.status(500).json({ error: "Error interno generando la firma" });
  }
});

// ======================
// WEBHOOK WOMPI
// ======================
const generarFirma = (reference, amountInCents, currency, integrityKey) =>
  crypto.createHash("sha256").update(`${reference}${amountInCents}${currency}${integrityKey}`).digest("hex");

app.post("/webhook-wompi", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const parsed = JSON.parse(req.body.toString("utf8"));
    const { event, data } = parsed;
    if (!data?.transaction) return res.sendStatus(400);

    const tx = data.transaction;
    const localSignature = generarFirma(tx.reference, tx.amount_in_cents, tx.currency, process.env.WOMPI_INTEGRITY_KEY || "");
    const headerSignature = req.headers["integrity-signature"] || req.headers["content-signature"];

    if (headerSignature && localSignature && headerSignature !== localSignature) {
      console.warn("❌ Firma de integridad no coincide");
      return res.sendStatus(403);
    }

    if (event === "transaction.updated" && tx.status === "APPROVED") {
      const pendiente = await Pendiente.findOne({ reference: tx.reference });
      if (pendiente) {
        await Ticket.create({
          correo: tx.customer_email || pendiente.correo,
          nombre: tx.customer_name || pendiente.nombre,
          numeros: pendiente.numeros,
          estadoPago: "pagado",
          referencia: tx.reference,
        });
        await pendiente.deleteOne();
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// ======================
// LOGIN ADMIN
// ======================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect("/admin.html");
  }
  res.send('❌ Usuario o contraseña incorrecta. <a href="/login.html">Volver</a>');
});

// ======================
// ADMIN ELIMINAR TICKET
// ======================
app.delete("/admin/ticket/:id", async (req, res) => {
  if (!req.session.loggedIn) return res.status(401).json({ error: "No autorizado" });
  try {
    await Ticket.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// ======================
// ERROR HANDLER
// ======================
app.use((err, req, res, next) => {
  console.error("Error interno:", err);
  res.status(500).json({ error: "Error interno" });
});

// ======================
// SERVIDOR
// ======================
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
