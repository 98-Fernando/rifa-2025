import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import bodyParser from "body-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import crypto from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

// Crear la app de Express
const app = express();
const PORT = process.env.PORT || 5000;

// Seguridad HTTP headers + CSP
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
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com"],
      connectSrc: [
        "'self'",
        "https://api.emailjs.com",
        "https://otlp.nr-data.net",
        "https://production.wompi.co",
        "https://sandbox.wompi.co",
      ],
      frameSrc: ["'self'", "https://checkout.wompi.co"], // necesario para Wompi
    },
  })
);

// Límite global de solicitudes
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Demasiadas solicitudes, intenta más tarde.",
  })
);

// Parsers y CORS
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.use(express.json()); // necesario para Wompi webhook

// Sesiones con almacenamiento en MongoDB
app.use(
  session({
    secret: process.env.SESSION_SECRET || "admin1",
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
    },
  })
);

// Archivos estáticos
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html"))
);

// Protección ruta admin
app.get("/admin.html", (req, res, next) =>
  req.session.loggedIn ? next() : res.redirect("/login.html")
);

// Limite para rutas de API
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 100 : 500,
    message: "Demasiadas solicitudes a la API, intenta más tarde.",
  })
);

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Conexión exitosa a MongoDB"))
  .catch((err) => console.error("❌ Error al conectar a MongoDB", err));

// Rutas
import ticketRoutes from "./routes/tickets.js";
import Ticket from "./models/Ticket.js";
app.use("/api/tickets", ticketRoutes);

// -------------------------------
// INTEGRACIÓN WOMPI
// -------------------------------
const WOMPI_ENV = process.env.WOMPI_ENV || "sandbox";
const WOMPI_BASE_URL =
  WOMPI_ENV === "production"
    ? "https://production.wompi.co/v1"
    : "https://sandbox.wompi.co/v1";

console.log(`🔹 Usando entorno Wompi: ${WOMPI_ENV}`);

function generarFirma(reference, amountInCents, currency, privateKey) {
  const cadena = `${reference}${amountInCents}${currency}${privateKey}`;
  return crypto.createHash("sha256").update(cadena).digest("hex");
}

app.post("/api/generar-firma", (req, res) => {
  try {
    const { cantidad } = req.body;
    const unitPrice = Number(process.env.PRECIO_BOLETO) || 5000;
    const amountInCents = cantidad * unitPrice * 100;
    const reference = `ORDER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const integritySignature = generarFirma(
      reference,
      amountInCents,
      "COP",
      process.env.WOMPI_PRIVATE_KEY
    );

    res.json({
      reference,
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

// Webhook Wompi
app.post("/webhook-wompi", async (req, res) => {
  try {
    console.log("📩 Evento recibido en Webhook:", JSON.stringify(req.body, null, 2));

    const evento = req.body.event;
    if (evento === "transaction.updated") {
      const transaccion = req.body.data.transaction;
      const referencia = transaccion.reference;
      const estado = transaccion.status; // APPROVED, DECLINED, PENDING

      console.log(`🔔 Transacción ${referencia} actualizada: ${estado}`);

      if (estado === "APPROVED") {
        await Ticket.create({
          correo: transaccion.customer_email,
          nombre: transaccion.customer_name || "Cliente",
          numeros: [],
          pagado: true,
          referencia,
        });
        console.log("✅ Ticket creado en DB");
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook Wompi:", error);
    res.sendStatus(500);
  }
});

// Rutas post pago
app.get("/success", (req, res) => res.send("✅ Pago aprobado, gracias por participar."));
app.get("/failure", (req, res) => res.send("❌ Pago rechazado, intenta de nuevo."));
app.get("/pending", (req, res) => res.send("⌛ Pago en proceso, espera confirmación."));

// -------------------------------

// Login administrador
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect("/admin.html");
  }
  res.send(
    '❌ Usuario o contraseña incorrecta. <a href="/login.html">Volver</a>'
  );
});

// Eliminar ticket por ID
app.delete("/admin/ticket/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await Ticket.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: "Ticket eliminado" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error eliminando el ticket" });
  }
});

// Middleware de errores
app.use((err, req, res, next) => {
  console.error("Error interno del servidor:", err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// Levantar servidor
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
