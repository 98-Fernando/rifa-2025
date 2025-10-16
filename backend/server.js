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
import ticketsRouter from "./routes/tickets.js"; 
import consultaRouter from "./routes/consulta.js"; 
// 💡 Nuevo: Router para la API de Administración
import adminApiRouter from "./routes/admin.js"; 

// ----------------------
// CONFIG
// ----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;
const PUBLIC_PATH = path.join(__dirname, "..", "public");

// ----------------------
// 💡 CONFIGURACIÓN MERCADO PAGO 💡
// ----------------------
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || "TU_TOKEN_MP"; // Usa la variable de entorno

const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preference = new Preference(client);

// ----------------------
// 🚨 Middleware de Autenticación (Placeholder)
// ----------------------
const isAdmin = (req, res, next) => {
    // ⚠️ Importante: Debes implementar la lógica real de sesión/autenticación aquí.
    if (req.session.isAdmin) {
        next();
    } else {
        // Redirige a la página de login si no está autenticado
        res.redirect("/admin"); 
    }
};

// ----------------------
// NONCE + CSP header
// ----------------------
app.use((req, res, next) => {
    // Generación de Nonce
    res.locals.nonce = crypto.randomBytes(16).toString("base64");
    const nonce = `'nonce-${res.locals.nonce}'`;
    
    // **AJUSTE CSP CLAVE:** Añadimos 'unsafe-eval' para Mercado Pago SDK y 'blob:' 
    // y ajustamos script-src para solo 'self' y el nonce para archivos propios,
    // dejando las URLs de MP externas. 
    const csp = [
        `default-src 'self'`,
        `script-src 'self' ${nonce} https://www.mercadopago.com https://http2.mlstatic.com https://sdk.mercadopago.com 'unsafe-eval'`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`, // 'unsafe-inline' es común para CSS
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
// CLAVE: Esto permite leer el body como JSON, necesario para el login asíncrono
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "https://rifa-2025.onrender.com",
  credentials: true
}));

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

        const host = req.get('host');
        const protocol = req.protocol;
        const notificationUrl = `${protocol}://${host}/api/mercadopago/webhook`;
        
        // Define las URLs de retorno basadas en el ambiente y host actual
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
// WEBHOOK - MERCADO PAGO
// ----------------------
const webhookRouter = express.Router();
webhookRouter.post("/api/mercadopago/webhook", async (req, res) => {
    // La lógica del webhook se mantiene aquí
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
                    // Mover de pendiente a ticket final
                    await Ticket.create({
                        reference: txReference,
                        correo: payment.payer?.email || pendiente.correo,
                        nombre: payment.payer?.first_name || pendiente.nombre,
                        telefono: pendiente.telefono,
                        numeros: pendiente.numeros,
                        monto: payment.transaction_amount, // Guardar el monto pagado
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
// 🔗 CONEXIÓN DE RUTAS MODULARES 🔗
// ----------------------

// Rutas de API para el Frontend (públicas)
app.use('/api/tickets', ticketsRouter);
app.use('/api/tickets/consulta', consultaRouter);
// Rutas de API para el Administrador (protegidas)
app.use('/api/admin', adminApiRouter); 


// ----------------------
// 🔒 RUTAS DE ADMINISTRACIÓN Y VISTAS 🔒
// ----------------------

// 1. Login Handler (Manejo asíncrono con JS en el cliente)
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Agregamos los logs de debug que habías puesto
    console.log('Intento de login. Usuario enviado:', username);
    console.log('Usuario esperado (ENV):', process.env.ADMIN_USER);
    
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        req.session.isAdmin = true;
        console.log('✅ Autenticación exitosa. Respondiendo con 204.');
        // CLAVE: Devolvemos 204 para que JS maneje la redirección a /admin/dashboard
      res.status(200).json({ success: true, redirect: '/admin.html' });
    }
    
    console.log('❌ Autenticación fallida. Respondiendo con 401.');
    // Devolvemos 401 para que JS muestre un error
    res.status(401).json({ exito: false, mensaje: "Credenciales inválidas" }); 
});

// 2. Logout Handler
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error("Error al destruir sesión:", err);
        // Respondemos con JSON, ya que el logout es manejado por fetch en admin.js
        res.json({ exito: true, mensaje: "Sesión cerrada" });
    });
});


// 3. Vista de Login
app.get("/admin", (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect("/admin/dashboard");
    }
    // Sirve el login.html (ya actualizado para usar login.js)
    res.sendFile(path.join(PUBLIC_PATH, "login.html"));
});

// 4. Vista de Dashboard (Protegida)
app.get("/admin/dashboard", isAdmin, (req, res) => {
    // Sirve el admin.html (la tabla de tickets)
    res.sendFile(path.join(PUBLIC_PATH, "admin.html"));
});


// ----------------------
// Static files (Archivos públicos, incluyendo index.html)
// ----------------------
app.use(express.static(PUBLIC_PATH));

// Ruta principal
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_PATH, "index.html")));


// ----------------------
// START
// ----------------------
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🔒 Dashboard Admin: http://localhost:${PORT}/admin`);
});
