// server.js
// Requisitos: Node >=16
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

// ----------------------
// CONFIG
// ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------------
// NONCE + CSP header (por petición)
// CORRECCIÓN FINAL: Eliminamos ${nonce} de style-src para que 'unsafe-inline' funcione.
// ----------------------
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    const nonce = `'nonce-${res.locals.nonce}'`;
    const csp = [
        `default-src 'self'`,
        // Mantenemos nonce para scripts
        `script-src 'self' ${nonce} https://checkout.wompi.co https://cdn.wompi.co https://cdn.jsdelivr.net https://unpkg.com`,
        // 🚨 CAMBIO CRÍTICO: Eliminamos ${nonce} para que 'unsafe-inline' funcione y el widget muestre estilos.
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`, 
        `font-src 'self' https://fonts.gstatic.com`,
        `img-src 'self' data: https://cdn-icons-png.flaticon.com https://checkout.wompi.co https://cdn.wompi.co`,
        `connect-src 'self' https://production.wompi.co https://sandbox.wompi.co https://checkout.wompi.co https://api.wompi.co https://api.emailjs.com`,
        `frame-src 'self' https://checkout.wompi.co https://cdn.wompi.co`,
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);
    next();
});

// ----------------------
// Helmet (no CSP, lo manejamos arriba)
// ----------------------
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    })
);

// ----------------------
// Parsers, rate limit, CORS
// ----------------------
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true }));

// ----------------------
// Sessions
// ----------------------
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

// ----------------------
// Static files
// ----------------------
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

// ----------------------
// DB
// ----------------------
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB"))
    .catch((err) => console.error("❌ Error MongoDB:", err));

// ----------------------
// API - CONFIG
// ----------------------
app.get("/api/config", (req, res) => {
    res.json({
        exito: true,
        precio: Number(process.env.PRECIO_BOLETO) || 5000,
        publicKey: process.env.WOMPI_PUBLIC_KEY || "",
        urlSuccess: process.env.URL_SUCCESS || "",
        urlFailure: process.env.URL_FAILURE || "",
        urlPending: process.env.URL_PENDING || "",
        nonce: res.locals.nonce,
    });
});

// ----------------------
// API - TICKETS 
// ----------------------
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


// ----------------------
// WEBHOOK 
// ----------------------
const webhookRouter = express.Router();
webhookRouter.post("/webhook-wompi", express.raw({ type: "application/json" }), async (req, res) => {
    try {
        const rawBody = req.body.toString("utf8");
        const parsed = JSON.parse(rawBody);
        const { event, data } = parsed;
        if (!data?.transaction) return res.sendStatus(400);

        const tx = data.transaction;

        // Integrity verification using INTEGRITY_KEY (sha256)
        const integrityKey = process.env.WOMPI_INTEGRITY_KEY || "";
        const localSignature = crypto
            .createHash("sha256")
            .update(`${tx.reference}${tx.amount_in_cents}${tx.currency}${integrityKey}`)
            .digest("hex");

        const headerSignature =
            req.headers["integrity-signature"] ||
            req.headers["signature"] ||
            req.headers["content-signature"];

        // Nota: La verificación de la firma del webhook es clave para la seguridad.
        if (headerSignature && localSignature && headerSignature !== localSignature) {
            console.warn("⚠️ Firma no coincide. Esperado:", localSignature, "Recibido:", headerSignature);
            return res.sendStatus(403);
        }

        // Procesar APPROVED
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
                console.log(`🎟️ Ticket confirmado: ${tx.reference}`);
            } else {
                console.log(`ℹ️ Transacción aprobada pero no existe pendiente: ${tx.reference}`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("❌ Webhook error:", err);
        res.sendStatus(500);
    }
});
app.use(webhookRouter);

// ----------------------
// START
// ----------------------
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
