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
// VALIDAR VARIABLES ENTORNO (fallará rápido si falta)
 // Acepta que uses WOMPI_PUBLIC_KEY (sandbox o prod) y WOMPI_INTEGRITY_KEY
if (!process.env.MONGO_URI) throw new Error("❌ MONGO_URI no definida en .env");
if (!process.env.WOMPI_PUBLIC_KEY) console.warn("⚠️ WOMPI_PUBLIC_KEY no definida en .env — la ruta /api/config devolverá error si falta.");
if (!process.env.WOMPI_INTEGRITY_KEY) console.warn("⚠️ WOMPI_INTEGRITY_KEY no definida en .env — webhook no podrá validar firma.");

// ======================
// MIDDLEWARES GLOBALES
// ======================
// Usamos json para la mayoría de rutas, pero para el webhook usaremos express.raw en la propia ruta.
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
        // permitir conexiones a endpoints wompi (sandbox/production), checkout y otros que necesites
        connectSrc: [
          "'self'",
          "https://production.wompi.co",
          "https://sandbox.wompi.co",
          "https://checkout.wompi.co",
          "https://api.emailjs.com",
        ],
        frameSrc: ["'self'", "https://checkout.wompi.co"],
      },
    },
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Demasiadas solicitudes, intenta más tarde.",
  })
);

// JSON para la mayoría de endpoints
app.use(express.json());
// urlencoded para formularios
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

// ======================
// SESIONES
// ======================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "admin1",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24,
      mongoOptions: { useUnifiedTopology: true },
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
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);

// ======================
// DB - modelos
// ======================
// Asegúrate de que estos archivos existan: ./models/Ticket.js y ./models/Pendiente.js
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    writeConcern: { w: 1, j: true, wtimeout: 1000 },
  })
  .then(() => console.log("✅ Conexión exitosa a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB", err));

// ======================
// RUTA CONFIG
// ======================
app.get("/api/config", (req, res) => {
  // Si quieres usar claves separadas sandbox/live, controla con NODE_ENV aquí
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!publicKey) {
    console.error("❌ Clave pública de Wompi no disponible");
    return res.status(500).json({ exito: false, mensaje: "Clave pública de Wompi no disponible" });
  }

  res.json({
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 5000,
    publicKey,
  });
});

// ======================
// RUTAS TICKETS
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
    console.error(err);
    res.status(500).json({ exito: false, mensaje: "Error al cargar números" });
  }
});

app.get("/api/tickets/consulta", async (req, res) => {
  try {
    const totalTickets = await Ticket.countDocuments();
    const porcentaje = Math.min(100, Math.round((totalTickets / 100) * 100));
    res.json({ exito: true, porcentaje });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exito: false });
  }
});

app.post("/api/tickets/guardar-pendiente", async (req, res) => {
  try {
    const { nombre, correo, telefono, numeros } = req.body;
    if (!nombre || !correo || !telefono || !Array.isArray(numeros) || numeros.length === 0)
      return res.status(400).json({ exito: false, mensaje: "Datos incompletos" });

    const reference = `ticket_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await Pendiente.create({ reference, nombre, correo, telefono, numeros });
    res.json({ exito: true, reference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exito: false, mensaje: "Error guardando pendiente" });
  }
});

// ======================
// WEBHOOK Wompi (usa raw body para validación de firma si necesitas usar HMAC/body).
// Usamos aquí express.raw para recibir el body sin modificar y luego parsear JSON.
// ======================
const generarFirma = (reference, amountInCents, currency, integrityKey) =>
  crypto.createHash("sha256").update(`${reference}${amountInCents}${currency}${integrityKey}`).digest("hex");

// middleware específico para esta ruta que parsea raw
app.post(
  "/webhook-wompi",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      if (!req.body || req.body.length === 0) {
        console.warn("Webhook: body vacío");
        return res.sendStatus(400);
      }

      // parseamos JSON desde raw
      let parsed;
      try {
        parsed = JSON.parse(req.body.toString("utf8"));
      } catch (err) {
        console.error("Webhook: error parseando JSON raw:", err);
        return res.sendStatus(400);
      }

      const { event, data } = parsed;
      if (!data || !data.transaction) return res.sendStatus(400);

      const tx = data.transaction;

      // Calcula firma local usando el esquema que tú usas (reference+amount+currency+integrityKey)
      let localSignature = null;
      try {
        localSignature = generarFirma(
          tx.reference,
          tx.amount_in_cents,
          tx.currency,
          process.env.WOMPI_INTEGRITY_KEY || ""
        );
      } catch (err) {
        console.warn("No fue posible generar localSignature:", err);
      }

      // Wompi puede enviar header 'integrity-signature' o 'content-signature'
      const headerSignature = req.headers["integrity-signature"] || req.headers["content-signature"];
      if (headerSignature && localSignature && headerSignature !== localSignature) {
        console.warn("❌ Firma inválida en webhook (header no coincide con firma local).");
        return res.sendStatus(403);
      }

      // Si transacción aprobada -> mover pendiente a Ticket
      if (event === "transaction.updated" && tx.status === "APPROVED") {
        const pendiente = await Pendiente.findOne({ reference: tx.reference });
        if (!pendiente) {
          console.warn(`Pendiente no encontrado para referencia ${tx.reference}`);
          return res.sendStatus(404);
        }

        await Ticket.create({
          correo: tx.customer_email || pendiente.correo,
          nombre: tx.customer_name || pendiente.nombre,
          numeros: pendiente.numeros,
          estadoPago: "pagado",
          referencia: tx.reference,
        });

        await pendiente.deleteOne();
        console.log(`✅ Ticket confirmado: ${tx.reference}`);
      }

      res.sendStatus(200);
    } catch (err) {
      console.error("Error en webhook-wompi:", err);
      res.sendStatus(500);
    }
  }
);

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
    res.status(200).json({ success: true, message: "Ticket eliminado" });
  } catch (err) {
    console.error("Error eliminando ticket:", err);
    res.status(500).json({ success: false, error: "Error eliminando el ticket" });
  }
});

// ======================
// ERROR HANDLER
// ======================
app.use((err, req, res, next) => {
  console.error("Error interno del servidor:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ======================
// SERVIDOR
// ======================
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
