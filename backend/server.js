// server.js
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const PORT = process.env.PORT || 5000;

// Seguridad
app.use(helmet());
app.use(rateLimit({ windowMs: 15*60*1000, max:100, message:"Demasiadas solicitudes, intenta más tarde." }));

// Middlewares
app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "admin1",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    ttl: 60*60*24
  }),
  cookie: { secure: process.env.NODE_ENV==="production", maxAge:1000*60*60*24 }
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname,"..","public")));
app.get("/", (req,res) => res.sendFile(path.join(__dirname,"..","public","index.html")));

// MongoDB
mongoose.connect(process.env.MONGO_URI,{ useNewUrlParser:true, useUnifiedTopology:true })
  .then(()=>console.log("✅ Conexión exitosa a MongoDB"))
  .catch(err=>console.error("❌ Error al conectar a MongoDB",err));

// Rutas Tickets
import ticketRoutes from "./routes/tickets.js";
import Ticket from "./models/Ticket.js";
app.use("/api/tickets", ticketRoutes);

// Wompi
const WOMPI_ENV = process.env.WOMPI_ENV||"sandbox";
const WOMPI_BASE_URL = WOMPI_ENV==="production" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
console.log(`🔹 Usando entorno Wompi: ${WOMPI_ENV}`);

function generarFirma(reference, amountInCents, currency, integrityKey){
  return crypto.createHash("sha256").update(`${reference}${amountInCents}${currency}${integrityKey}`).digest("hex");
}

app.post("/api/generar-firma",(req,res)=>{
  try{
    const { cantidad } = req.body;
    const unitPrice = Number(process.env.PRECIO_BOLETO) || 5000;
    const amountInPesos = cantidad * unitPrice;
    const amountInCents = amountInPesos*100;
    const reference = `ORDER_${Date.now()}_${Math.floor(Math.random()*10000)}`;

    const signature = generarFirma(reference,amountInCents,"COP",process.env.WOMPI_INTEGRITY_KEY);

    res.json({
      reference,
      amountInPesos,
      amountInCents,
      currency:"COP",
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      signature
    });
  } catch(err){
    console.error("❌ Error generando firma:",err);
    res.status(500).json({ error:"Error generando firma" });
  }
});

// Webhook Wompi
app.post("/webhook-wompi", async (req,res)=>{
  try{
    const evento = req.body.event;
    if(evento==="transaction.updated"){
      const tx = req.body.data.transaction;
      if(tx.status==="APPROVED"){
        await Ticket.create({ correo:tx.customer_email, nombre:tx.customer_name||"Cliente", numeros:[], pagado:true, referencia:tx.reference });
        console.log(`✅ Ticket creado para referencia ${tx.reference}`);
      }
    }
    res.sendStatus(200);
  } catch(err){ console.error(err); res.sendStatus(500); }
});

// Login Admin
app.post("/login",(req,res)=>{
  const { username,password } = req.body;
  if(username===process.env.ADMIN_USER && password===process.env.ADMIN_PASS){ req.session.loggedIn=true; return res.redirect("/admin.html"); }
  res.send('❌ Usuario o contraseña incorrecta. <a href="/login.html">Volver</a>');
});

// Admin
app.delete("/admin/ticket/:id", async(req,res)=>{
  try{
    await Ticket.findByIdAndDelete(req.params.id);
    res.json({ success:true, message:"Ticket eliminado" });
  } catch(err){ res.status(500).json({ success:false, error:"Error eliminando el ticket" }); }
});

// Errores
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({ error:"Error interno del servidor" }); });

// Servidor
app.listen(PORT,()=>console.log(`🚀 Servidor corriendo en http://localhost:${
