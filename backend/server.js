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
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { URL } from 'url';

// ----------------------
// CONFIG
// ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const TOTAL_NUMEROS = 1000; // 👈 DEFINIMOS EL RANGO MÁXIMO (000 a 999)

// ----------------------
// 💡 CONFIGURACIÓN MERCADO PAGO 💡
// ----------------------
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "APP_USR-6749171446158778-101616-33c0332a1284adf8101f059e5538dcf3-2926318204";

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preference = new Preference(client);

// ----------------------
// NONCE + CSP header
// ----------------------
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    const nonce = `'nonce-${res.locals.nonce}'`;
    const csp = [
        `default-src 'self'`,
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
// Helmet
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
        nonce: res.locals.nonce,
    });
});

// ----------------------
// API - MERCADO PAGO (Genera la Preferencia)
// ----------------------
app.post("/api/mercadopago/preference", async (req, res) => {
    try {
        const { reference, nombre, correo, telefono, monto } = req.body;

        if (!reference || !monto || !nombre) {
            return res.status(400).json({ exito: false, mensaje: "Datos de pago incompletos." });
        }

        // Determina la URL base para el Webhook. En Render, esto es vital.
        const host = req.get('host');
        const protocol = req.protocol;
        const notificationUrl = `${protocol}://${host}/api/mercadopago/webhook`;
        
        // Define las back_urls usando el host actual como fallback
        const backUrls = {
            success: process.env.URL_SUCCESS || `${protocol}://${host}/success`,
            pending: process.env.URL_PENDING || `${protocol}://${host}/pending`,
            failure: process.env.URL_FAILURE || `${protocol}://${host}/failure`,
        };

        const preferenceBody = {
            items: [{
                id: reference,
                title: `Tickets de Rifa - Ref: ${reference}`,
                quantity: 1,
                unit_price: Number(monto),
                currency_id: "COP"
            }],
            payer: {
                name: nombre,
                email: correo,
                phone: {
                    area_code: "",
                    number: telefono,
                },
            },
            external_reference: reference,
            back_urls: backUrls,
            notification_url: notificationUrl,
            auto_return: "approved",
            metadata: {
                nombre_cliente: nombre,
                correo_cliente: correo
            }
        };

        const result = await preference.create({ body: preferenceBody });

        res.json({
            exito: true,
            init_point: result.init_point,
            reference: reference,
        });

    } catch (err) {
        console.error("❌ Error creando preferencia de Mercado Pago:", err.message);
        res.status(500).json({ exito: false, mensaje: "Error creando preferencia de pago." });
    }
});


// ----------------------
// API - TICKETS y GUARDAR PENDIENTE (ACTUALIZADO RANGO 000-999)
// ----------------------

app.get("/api/tickets/numeros", async (req, res) => {
    try {
        const tickets = await Ticket.find({}, "numeros").lean();
        // Los números ocupados son strings de 3 dígitos (ej: '005')
        const ocupados = tickets.flatMap((t) => (t.numeros || []).map((n) => String(n).padStart(3, '0'))); 
        
        const total = TOTAL_NUMEROS; // 1000 números

        const numeros = Array.from({ length: total }, (_, i) => {
            // El número de la rifa es i, que va de 0 a 999
            const numStr = String(i).padStart(3, '0'); // Formato '000', '001', ... '999'
            return { 
                numero: numStr, 
                disponible: !ocupados.includes(numStr) 
            };
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
        const porcentaje = Math.min(100, Math.round((vendidos / TOTAL_NUMEROS) * 100)); // 👈 TOTAL_NUMEROS = 1000
        res.json({ exito: true, vendidos, porcentaje });
    } catch (err) {
        console.error("❌ Error consulta:", err);
        res.status(500).json({ exito: false, mensaje: "Error consultando" });
    }
});

app.post("/api/tickets/guardar-pendiente", async (req, res) => {
    try {
        const { nombre, correo, telefono, numeros } = req.body; // 'numeros' son strings de 3 dígitos
        if (!nombre || !correo || !telefono || !Array.isArray(numeros) || !numeros.length) {
            return res.status(400).json({ exito: false, mensaje: "Datos incompletos" });
        }
        
        const reference = `RIFA-${Date.now()}`;
        await Pendiente.create({
            nombre,
            correo,
            telefono,
            // Guardamos los números como strings de 3 dígitos en la DB (para consistencia)
            numeros: numeros, 
            reference,
        });
        res.json({ exito: true, reference });
    } catch (err) {
        console.error("❌ Error guardando pendiente:", err);
        res.status(500).json({ exito: false, mensaje: "Error guardando pendiente" });
    }
});


// ----------------------
// WEBHOOK - MERCADO PAGO
// ----------------------
const webhookRouter = express.Router();
webhookRouter.post("/api/mercadopago/webhook", async (req, res) => {
    try {
        const { type, data } = req.body;
        
        if (type === 'payment' && data?.id) {
            const paymentId = data.id;

            const payment = await client.payment.get({ id: paymentId });

            const txStatus = payment.status;
            const txReference = payment.external_reference; 
            
            if (txStatus === 'approved') {
                const pendiente = await Pendiente.findOne({ reference: txReference });
                
                if (pendiente) {
                    await Ticket.create({
                        reference: txReference,
                        correo: payment.payer?.email || pendiente.correo,
                        nombre: payment.payer?.first_name || pendiente.nombre,
                        telefono: pendiente.telefono,
                        numeros: pendiente.numeros, // Son strings de 3 dígitos
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
            }
        }
        
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
