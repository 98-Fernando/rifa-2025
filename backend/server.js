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
// MIDDLEWARES PARA RENDER
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
          "https://api.wompi.co",
        ],
        frameSrc: ["'self'", "https://checkout.wompi.co"],
      },
    },
  })
);

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({ 
  origin: [
    'https://rifa-2025.onrender.com',
    'https://checkout.wompi.co'
  ],
  credentials: true 
}));

// ======================
// SESIONES PARA RENDER
// ======================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "rifa-2025-render-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24,
    }),
    cookie: {
      secure: true, // HTTPS en Render
      maxAge: 1000 * 60 * 60 * 24,
      sameSite: "lax",
    },
  })
);

// ======================
// DB CONNECTION
// ======================
import Ticket from "./models/Ticket.js";
import Pendiente from "./models/Pendiente.js";

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error MongoDB:", err));

// ======================
// API CONFIG - RENDER OPTIMIZADO
// ======================
app.get("/api/config", (req, res) => {
  console.log("🔍 Enviando config desde Render");
  
  const config = {
    exito: true,
    precio: Number(process.env.PRECIO_BOLETO) || 5000,
    publicKey: process.env.WOMPI_PUBLIC_KEY || "",
    urlSuccess: "https://rifa-2025.onrender.com/success",
    urlFailure: "https://rifa-2025.onrender.com/failure", 
    urlPending: "https://rifa-2025.onrender.com/pending",
  };
  
  console.log("📤 Config enviada:", {
    precio: config.precio,
    tienePublicKey: !!config.publicKey,
    publicKeyInicio: config.publicKey?.substring(0, 15) + "..."
  });
  
  res.json(config);
});

// ======================
// SIGNATURE WOMPI - RENDER
// ======================
app.post("/api/signature", (req, res) => {
  try {
    const { reference, amountInCents, currency } = req.body;
    
    console.log("🔐 Generando firma en Render:", { 
      reference, 
      amountInCents, 
      currency 
    });

    if (!reference || !amountInCents || !currency) {
      console.error("❌ Faltan datos para la firma");
      return res.status(400).json({ 
        error: "Faltan datos para generar la firma" 
      });
    }

    const integrityKey = process.env.WOMPI_INTEGRITY_KEY;
    if (!integrityKey) {
      console.error("❌ WOMPI_INTEGRITY_KEY no encontrada en Render");
      return res.status(500).json({ 
        error: "Configuración de Wompi incompleta" 
      });
    }

    // Concatenación exacta según documentación Wompi
    const concatenatedString = `${reference}${amountInCents}${currency}${integrityKey}`;
    
    const signature = crypto
      .createHash("sha256")
      .update(concatenatedString)
      .digest("hex");

    console.log("✅ Firma generada exitosamente en Render");
    
    return res.json({ signature });
    
  } catch (err) {
    console.error("❌ Error generando firma en Render:", err);
    return res.status(500).json({ 
      error: "Error interno del servidor" 
    });
  }
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

    console.log(`📊 Números ocupados: ${ocupados.length}/100`);
    res.json({ exito: true, numeros });
    
  } catch (err) {
    console.error("❌ Error cargando números:", err);
    res.status(500).json({ exito: false, mensaje: "Error al cargar números" });
  }
});

app.get("/api/tickets/consulta", async (req, res) => {
  try {
    const totalTickets = await Ticket.countDocuments();
    const porcentaje = Math.min(100, Math.round((totalTickets / 100) * 100));
    
    console.log(`📈 Progreso actual: ${porcentaje}%`);
    res.json({ exito: true, porcentaje });
    
  } catch (err) {
    console.error("❌ Error consulta progreso:", err);
    res.status(500).json({ exito: false });
  }
});

app.post("/api/tickets/guardar-pendiente", async (req, res) => {
  try {
    const { nombre, correo, telefono, numeros } = req.body;
    
    console.log("📝 Guardando ticket pendiente:", {
      nombre,
      correo, 
      telefono,
      numeros: numeros?.length
    });
    
    if (!nombre || !correo || !telefono || !Array.isArray(numeros) || numeros.length === 0) {
      return res.status(400).json({ 
        exito: false, 
        mensaje: "Datos incompletos" 
      });
    }

    // Verificar números disponibles
    const tickets = await Ticket.find({}, { numeros: 1, _id: 0 });
    const ocupados = tickets.flatMap((t) => t.numeros || []);
    
    const numerosOcupados = numeros.filter(n => ocupados.includes(n));
    if (numerosOcupados.length > 0) {
      return res.status(400).json({ 
        exito: false, 
        mensaje: `Los números ${numerosOcupados.join(', ')} ya están ocupados.` 
      });
    }

    const reference = `rifa_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    await Pendiente.create({ 
      reference, 
      nombre, 
      correo, 
      telefono, 
      numeros,
      fechaCreacion: new Date()
    });
    
    console.log("✅ Ticket pendiente guardado:", reference);
    res.json({ exito: true, reference });
    
  } catch (err) {
    console.error("❌ Error guardando pendiente:", err);
    res.status(500).json({ 
      exito: false, 
      mensaje: "Error interno del servidor" 
    });
  }
});

// ======================
// WEBHOOK WOMPI PARA RENDER
// ======================
app.post("/webhook-wompi", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    console.log("🔔 Webhook recibido de Wompi en Render");
    console.log("📨 Headers:", req.headers);
    
    const parsed = JSON.parse(req.body.toString("utf8"));
    const { event, data } = parsed;
    
    console.log("📋 Evento Wompi:", event);
    
    if (!data?.transaction) {
      console.warn("❌ No se encontró data de transacción");
      return res.sendStatus(400);
    }

    const tx = data.transaction;
    console.log("💳 Transacción recibida:", {
      reference: tx.reference,
      status: tx.status,
      amount: tx.amount_in_cents,
      id: tx.id
    });

    // Validar firma de integridad
    const integrityKey = process.env.WOMPI_INTEGRITY_KEY;
    if (integrityKey) {
      const expectedSignature = crypto
        .createHash("sha256")
        .update(`${tx.reference}${tx.amount_in_cents}${tx.currency}${integrityKey}`)
        .digest("hex");
      
      const receivedSignature = req.headers["integrity-signature"] || 
                               req.headers["content-signature"];
      
      if (receivedSignature && receivedSignature !== expectedSignature) {
        console.warn("❌ Firma de integridad no válida");
        console.warn("🔍 Esperada:", expectedSignature);
        console.warn("🔍 Recibida:", receivedSignature);
        return res.sendStatus(403);
      } else if (receivedSignature) {
        console.log("✅ Firma de integridad válida");
      }
    }

    // Procesar transacción aprobada
    if (event === "transaction.updated" && tx.status === "APPROVED") {
      console.log("🎉 Procesando transacción aprobada");
      
      const pendiente = await Pendiente.findOne({ reference: tx.reference });
      
      if (pendiente) {
        console.log("📝 Creando ticket definitivo para:", tx.reference);
        
        // Crear ticket definitivo
        const nuevoTicket = await Ticket.create({
          correo: tx.customer_email || pendiente.correo,
          nombre: tx.customer_name || pendiente.nombre,
          telefono: pendiente.telefono,
          numeros: pendiente.numeros,
          estadoPago: "pagado",
          referencia: tx.reference,
          montoTotal: tx.amount_in_cents / 100,
          fechaCreacion: new Date(),
          transaccionId: tx.id
        });
        
        // Eliminar pendiente
        await pendiente.deleteOne();
        
        console.log("🎫 Ticket creado exitosamente:", nuevoTicket._id);
        console.log("🗑️ Ticket pendiente eliminado");
      } else {
        console.warn("⚠️ No se encontró ticket pendiente para:", tx.reference);
      }
    } else {
      console.log("ℹ️ Evento no procesado:", event, "Status:", tx.status);
    }

    res.sendStatus(200);
    
  } catch (err) {
    console.error("❌ Error en webhook Wompi:", err);
    res.sendStatus(500);
  }
});

// ======================
// PÁGINAS DE REDIRECCIÓN RENDER
// ======================
app.get("/success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <title>¡Pago Exitoso!</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #10b981, #34d399); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .container { background: white; padding: 3rem; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
          .icon { font-size: 5rem; margin-bottom: 1rem; }
          h1 { color: #10b981; margin-bottom: 1rem; font-size: 2rem; }
          p { color: #666; margin-bottom: 1rem; line-height: 1.6; }
          button { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 10px; font-size: 1rem; cursor: pointer; transition: all 0.3s; }
          button:hover { background: #2563eb; transform: translateY(-2px); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🎉</div>
          <h1>¡Pago Exitoso!</h1>
          <p><strong>¡Felicidades!</strong> Tu pago se procesó correctamente.</p>
          <p>Ya estás participando oficialmente en la rifa.</p>
          <p>Recibirás un correo de confirmación con los detalles de tu participación.</p>
          <p><strong>¡Mucha suerte!</strong> 🍀</p>
          <button onclick="window.location.href='https://rifa-2025.onrender.com'">
            🏠 Volver al inicio
          </button>
        </div>
      </body>
    </html>
  `);
});

app.get("/failure", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <title>Pago No Completado</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #ef4444, #f87171); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .container { background: white; padding: 3rem; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
          .icon { font-size: 5rem; margin-bottom: 1rem; }
          h1 { color: #ef4444; margin-bottom: 1rem; font-size: 2rem; }
          p { color: #666; margin-bottom: 1rem; line-height: 1.6; }
          button { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 10px; font-size: 1rem; cursor: pointer; transition: all 0.3s; margin: 0.5rem; }
          button:hover { background: #2563eb; transform: translateY(-2px); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Pago No Completado</h1>
          <p>Hubo un problema procesando tu pago.</p>
          <p><strong>No te preocupes:</strong> No se realizó ningún cobro y tus números siguen disponibles.</p>
          <p>Puedes intentar nuevamente o contactar soporte si el problema persiste.</p>
          <button onclick="window.location.href='https://rifa-2025.onrender.com'">
            🔄 Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  `);
});

app.get("/pending", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <title>Pago Pendiente</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #f59e0b, #fbbf24); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .container { background: white; padding: 3rem; border-radius: 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.1); text-align: center; max-width: 500px; }
          .icon { font-size: 5rem; margin-bottom: 1rem; }
          h1 { color: #f59e0b; margin-bottom: 1rem; font-size: 2rem; }
          p { color: #666; margin-bottom: 1rem; line-height: 1.6; }
          button { background: #3b82f6; color: white; border: none; padding: 1rem 2rem; border-radius: 10px; font-size: 1rem; cursor: pointer; transition: all 0.3s; }
          button:hover { background: #2563eb; transform: translateY(-2px); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">⏳</div>
          <h1>Pago Pendiente</h1>
          <p>Tu pago está siendo procesado por el banco.</p>
          <p><strong>¡Tranquilo!</strong> Te notificaremos por correo cuando se complete.</p>
          <p>Tus números están reservados mientras se procesa el pago.</p>
          <p>Este proceso puede tomar unos minutos.</p>
          <button onclick="window.location.href='https://rifa-2025.onrender.com'">
            🏠 Volver al inicio
          </button>
        </div>
      </body>
    </html>
  `);
});

// ======================
// DEBUG ENDPOINT (RENDER)
// ======================
app.get("/api/debug", (req, res) => {
  res.json({
    platform: "Render",
    environment: process.env.NODE_ENV,
    hasPublicKey: !!process.env.WOMPI_PUBLIC_KEY,
    hasIntegrityKey: !!process.env.WOMPI_INTEGRITY_KEY,
    hasMongoUri: !!process.env.MONGO_URI,
    publicKeyPrefix: process.env.WOMPI_PUBLIC_KEY?.substring(0, 20) + "...",
    precio: process.env.PRECIO_BOLETO,
    timestamp: new Date().toISOString(),
    urls: {
      success: "https://rifa-2025.onrender.com/success",
      failure: "https://rifa-2025.onrender.com/failure",
      pending: "https://rifa-2025.onrender.com/pending",
      webhook: "https://rifa-2025.onrender.com/webhook-wompi"
    }
  });
});

// ======================
// HEALTH CHECK PARA RENDER
// ======================
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    service: "Rifa 2025"
  });
});

// ======================
// ARCHIVOS ESTÁTICOS
// ======================
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// ======================
// MANEJO DE ERRORES 404
// ======================
app.use("*", (req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ======================
// INICIAR SERVIDOR EN RENDER
// ======================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor Rifa 2025 ejecutándose en Render`);
  console.log(`🌍 Puerto: ${PORT}`);
  console.log(`🔗 URL: https://rifa-2025.onrender.com`);
  console.log(`🔍 Debug: https://rifa-2025.onrender.com/api/debug`);
  console.log(`💓 Health: https://rifa-2025.onrender.com/health`);
});
