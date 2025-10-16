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
import { MercadoPagoConfig, Preference } from 'mercadopago'; // 👈 NUEVO: SDK de Mercado Pago
import { URL } from 'url'; // 👈 NUEVO: Para manejar URLs

// ----------------------
// CONFIG
// ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// ----------------------
// 💡 CONFIGURACIÓN MERCADO PAGO 💡
// ----------------------
// Usaremos el Access Token. Lo cargamos desde las variables de entorno para seguridad.
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "APP_USR-6749171446158778-101616-33c0332a1284adf8101f059e5538dcf3-2926318204";

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preference = new Preference(client);

// ----------------------
// NONCE + CSP header (Simplificado para Mercado Pago)
// Eliminamos todas las referencias a Wompi.
// ----------------------
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    const nonce = `'nonce-${res.locals.nonce}'`;
    const csp = [
        `default-src 'self'`,
        // Añadimos dominios de Mercado Pago a script y frame-src
        `script-src 'self' ${nonce} https://www.mercadopago.com https://http2.mlstatic.com https://sdk.mercadopago.com`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`,
        `font-src 'self' https://fonts.gstatic.com`,
        `img-src 'self' data: https://cdn-icons-png.flaticon.com https://www.mercadopago.com https://http2.mlstatic.com`,
        `connect-src 'self' https://api.mercadopago.com https://api.emailjs.com`,
        `frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com`,
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
// API - CONFIG (Solo devuelve el precio y nonce)
// Se eliminan las credenciales de Wompi.
// ----------------------
app.get("/api/config", (req, res) => {
    res.json({
        exito: true,
        precio: Number(process.env.PRECIO_BOLETO) || 5000,
        nonce: res.locals.nonce,
    });
});

// ----------------------
// API - MERCADO PAGO (Genera la Preferencia) 👈 NUEVO ENDPOINT
// ----------------------
app.post("/api/mercadopago/preference", async (req, res) => {
    try {
        const { reference, nombre, correo, telefono, monto } = req.body; // monto debe estar en COP, no en centavos

        if (!reference || !monto || !nombre) {
            return res.status(400).json({ exito: false, mensaje: "Datos de pago incompletos." });
        }

        const notificationUrl = new URL(`/api/mercadopago/webhook`, req.protocol + '://' + req.get('host')).toString();

        const preferenceBody = {
            items: [{
                id: reference,
                title: `Tickets de Rifa - Ref: ${reference}`,
                quantity: 1,
                unit_price: Number(monto),
                currency_id: "COP" // Asumiendo que es Colombia
            }],
            payer: {
                name: nombre,
                email: correo,
                phone: {
                    area_code: "",
                    number: telefono,
                },
            },
            external_reference: reference, // Usamos la referencia del ticket pendiente
            back_urls: {
                success: process.env.URL_SUCCESS || `${req.protocol}://${req.get('host')}/success`,
                pending: process.env.URL_PENDING || `${req.protocol}://${req.get('host')}/pending`,
                failure: process.env.URL_FAILURE || `${req.protocol}://${req.get('host')}/failure`,
            },
            notification_url: notificationUrl, // Webhook para notificaciones de pago
            auto_return: "approved",
            metadata: {
                nombre_cliente: nombre,
                correo_cliente: correo
            }
        };

        const result = await preference.create({ body: preferenceBody });

        res.json({
            exito: true,
            // El init_point es la URL a la que la app debe redirigir al usuario (Checkout Pro)
            init_point: result.init_point, 
            reference: reference,
        });

    } catch (err) {
        console.error("❌ Error creando preferencia de Mercado Pago:", err.message);
        res.status(500).json({ exito: false, mensaje: "Error creando preferencia de pago." });
    }
});


// ----------------------
// API - TICKETS y GUARDAR PENDIENTE (SIN CAMBIOS)
// ----------------------

// ... (El código de app.get("/api/tickets/numeros"), app.get("/api/tickets/consulta"), y app.post("/api/tickets/guardar-pendiente") va aquí sin cambios) ...

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
// WEBHOOK - MERCADO PAGO 👈 NUEVO WEBHOOK
// ----------------------
const webhookRouter = express.Router();
webhookRouter.post("/api/mercadopago/webhook", async (req, res) => {
    try {
        const { type, data } = req.body;
        
        // Mercado Pago puede enviar notificaciones de 'payment' o 'merchant_order'
        if (type === 'payment' && data?.id) {
            const paymentId = data.id;

            // 1. Obtener detalles del pago desde la API de MP (para verificar estado)
            const payment = await client.payment.get({ id: paymentId });

            const txStatus = payment.status;
            const txReference = payment.external_reference; // Usamos la referencia externa
            
            // 2. Procesar el pago APROBADO
            if (txStatus === 'approved') {
                const pendiente = await Pendiente.findOne({ reference: txReference });
                
                if (pendiente) {
                    await Ticket.create({
                        reference: txReference,
                        correo: payment.payer?.email || pendiente.correo,
                        nombre: payment.payer?.first_name || pendiente.nombre,
                        telefono: pendiente.telefono,
                        numeros: pendiente.numeros,
                        estadoPago: "pagado",
                    });
                    await pendiente.deleteOne();
                    console.log(`🎟️ Ticket confirmado (MP): ${txReference}`);
                } else {
                    console.log(`ℹ️ Transacción aprobada (MP) pero no existe pendiente: ${txReference}`);
                }
            } else if (txStatus === 'pending') {
                console.log(`⏳ Transacción pendiente (MP): ${txReference}`);
            } else if (txStatus === 'rejected' || txStatus === 'cancelled') {
                 console.log(`❌ Transacción rechazada (MP): ${txReference}`);
                 // Opcional: Podrías eliminar el pendiente aquí o marcarlo como fallido.
            }
        }
        
        // Siempre respondemos 200 para que Mercado Pago no reintente.
        res.sendStatus(200); 
    } catch (err) {
        console.error("❌ Webhook Mercado Pago error:", err);
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
