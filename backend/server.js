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
import { MercadoPagoConfig, Preference } from "mercadopago";
import ticketsRouter from "./routes/tickets.js";
import consultaRouter from "./routes/consulta.js";
import adminApiRouter from "./routes/admin.js";

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

// ==================== SEGURIDAD ====================
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https://cdn-icons-png.flaticon.com https://www.mercadopago.com`,
    `connect-src 'self' https://api.mercadopago.com`,
    `frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com`,
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CORS ====================
app.use(
  cors({
    origin: [
      "https://rifa-2025.onrender.com", // producción
      "http://localhost:5000", // local
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
      secure: true,
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// ==================== CONEXIÓN BASE DE DATOS ====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error en MongoDB:", err));

// ==================== AUTENTICACIÓN ADMIN ====================
const isAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.redirect("/login.html");
};

// ==================== RUTAS API ====================
app.get("/api/config", (req, res) => {
  res.json({
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 5000,
    nonce: res.locals.nonce,
  });
});

// === CREAR PREFERENCIA DE MERCADO PAGO ===
app.post("/api/mercadopago/preference", async (req, res) => {
  try {
    const { reference, nombre, correo, telefono, monto } = req.body;

    if (!reference || !monto || !nombre) {
      return res
        .status(400)
        .json({ exito: false, mensaje: "Faltan datos para generar el pago" });
    }

    const result = await mpPreference.create({
      body: {
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
          name: nombre,
          email: correo,
          phone: { number: telefono },
        },
        external_reference: reference,
        auto_return: "approved",
        back_urls: {
          success: "https://rifa-2025.onrender.com/success.html",
          failure: "https://rifa-2025.onrender.com/failure.html",
          pending: "https://rifa-2025.onrender.com/pending.html",
        },
      },
    });

    // ✅ Devolver el link de pago directo
    return res.json({ exito: true, init_point: result.init_point });
  } catch (err) {
    console.error("❌ Error creando preferencia Mercado Pago:", err);
    return res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al generar pago." });
  }
});

// ==================== LOGIN ADMIN ====================
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  ) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }

  return res
    .status(401)
    .json({ success: false, mensaje: "Credenciales inválidas" });
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

// ==================== ENLACE DE RUTAS ====================
app.use("/api/tickets", ticketsRouter);
app.use("/api/tickets/consulta", consultaRouter);
app.use("/api/admin", adminApiRouter);

// ==================== ARCHIVOS ESTÁTICOS ====================
app.use(express.static(PUBLIC_PATH));

app.get("/", (req, res) =>
  res.sendFile(path.join(PUBLIC_PATH, "index.html"))
);

// ==================== INICIO SERVIDOR ====================
app.listen(PORT, () => {
  console.log(`🚀 Servidor en ejecución: http://localhost:${PORT}`);
  console.log(`🔒 Panel admin: http://localhost:${PORT}/admin`);
});
