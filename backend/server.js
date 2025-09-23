import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import bodyParser from "body-parser";
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

// Map temporal para compras pendientes
const pendientes = new Map();

// ======================
// SEGURIDAD
// ======================
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com"],
      connectSrc: [
        "'self'",
        "https://api.emailjs.com",
        "https://otlp.nr-data.net",
        "https://production.wompi.co",
        "https://sandbox.wompi.co",
      ],
      frameSrc: ["'self'", "https://checkout.wompi.co"],
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

// ======================
// MIDDLEWARES
// ======================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "admin1",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24,
      mongoOptions: {
        useUnifiedTopology: true,
        writeConcern: { w: 1, j: true, wtimeout: 1000 },
      },
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
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
app.get("/admin.html", (req, res, next) =>
  req.session.loggedIn ? next() : res.redirect("/login.html")
);

// ======================
// DB
// ======================
import Ticket from "./models/Ticket.js";

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    writeConcern: { w: 1, j: true, wtimeout: 1000 },
  })
  .then(() => console.log("✅ Conexión exitosa a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB", err));

// ======================
// RUTAS TICKETS
// ======================
import ticketRoutes from "./routes/tickets.js";
app.use("/api/tickets", ticketRoutes);

// ======================
// WOMPI CONFIG
// ======================
const WOMPI_ENV = process.env.WOMPI_ENV || "sandbox";
const WOMPI_BASE_URL =
  WOMPI_ENV === "production"
    ? "https://production.wompi.co/v1"
    : "https://sandbox.wompi.co/v1";
console.log(`🔹 Usando entorno Wompi: ${WOMPI_ENV}`);

// ======================
// FUNCIONES WOMPI
// ======================
function generarFirma(reference, amountInCents, currency, integrityKey) {
  const cadena = `${reference}${amountInCents}${currency}${integrityKey}`;
  return crypto.createHash("sha256").update(cadena).digest("hex");
}

app.post("/api/generar-firma", (req, res) => {
  try {
    const { cantidad, reference } = req.body;
    const unitPrice = Number(process.env.PRECIO_BOLETO) || 5000;
    const amountInPesos = cantidad * unitPrice;
    const amountInCents = amountInPesos * 100;

    const integritySignature = generarFirma(
      reference,
      amountInCents,
      "COP",
      process.env.WOMPI_INTEGRITY_KEY
    );

    res.json({
      reference,
      amountInPesos,
      amountInCents,
      currency: "COP",
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      signature: integritySignature,
    });
  } catch (error) {
    console.error("❌ Error generando firma:", error);
    res.status(500).json({ error: "Error generando firma" });
  }
});

// ======================
// POST TEMPORAL PARA GUARDAR SELECCIÓN ANTES DEL PAGO
// ======================
app.post("/api/tickets/guardar-pendiente", (req, res) => {
  const { nombre, correo, telefono, numeros } = req.body;
  if (!nombre || !correo || !telefono || !Array.isArray(numeros) || numeros.length === 0) {
    return res.status(400).json({ exito: false, mensaje: "Datos incompletos o sin números seleccionados." });
  }
  const reference = `ticket_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  pendientes.set(reference, { nombre, correo, telefono, numeros });
  res.json({ exito: true, reference, mensaje: "Referencia generada, procede al pago con Wompi." });
});

// ======================
// WEBHOOK WOMPI
// ======================
app.post("/webhook-wompi", async (req, res) => {
  try {
    const evento = req.body.event;
    if (evento === "transaction.updated") {
      const tx = req.body.data.transaction;
      const referencia = tx.reference;

      if (tx.status === "APPROVED") {
        let datosTicket = {
          correo: tx.customer_email,
          nombre: tx.customer_name || "Cliente",
          numeros: [],
          estadoPago: "pagado",
          referencia,
        };

        if (pendientes.has(referencia)) {
          datosTicket = { ...datosTicket, ...pendientes.get(referencia) };
          pendientes.delete(referencia);
        }

        await Ticket.create(datosTicket);
        console.log(`✅ Ticket confirmado y guardado: ${referencia}`);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error webhook Wompi:", error);
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
  try {
    const { id } = req.params;
    await Ticket.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Ticket eliminado" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error eliminando el ticket" });
  }
});

// ======================
// ERRORES
// ======================
app.use((err, req, res, next) => {
  console.error("Error interno del servidor:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ======================
// SERVIDOR
// ======================
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
