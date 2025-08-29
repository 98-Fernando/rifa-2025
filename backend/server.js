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
import { config } from "dotenv";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, '..', '.env') });

// Crear la app de Express
const app = express();
const PORT = process.env.PORT || 5000;

// Seguridad HTTP headers + CSP
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://cdn-icons-png.flaticon.com"],
      connectSrc: ["'self'", "https://api.emailjs.com", "https://otlp.nr-data.net", "https://www.mercadopago.com.co"]
    }
  })
);

// Limite global de solicitudes
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes, intenta más tarde.'
}));

// Parsers y CORS
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Sesiones con almacenamiento en MongoDB
app.use(session({
  secret: process.env.SESSION_SECRET || 'admin1',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 60 * 60 * 24
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Protección ruta admin
app.get('/admin.html', (req, res, next) => req.session.loggedIn ? next() : res.redirect('/login.html'));

// Limite para rutas de API
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 500,
  message: 'Demasiadas solicitudes a la API, intenta más tarde.'
}));

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('✅ Conexión exitosa a MongoDB'))
  .catch(err => console.error('❌ Error al conectar a MongoDB', err));

// Rutas
import ticketRoutes from './routes/tickets.js'; // Asegúrate de que esta ruta sea correcta
app.use('/api/tickets', ticketRoutes);

// Crear preferencia de pago con Mercado Pago
import mercadopago from 'mercadopago';

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

app.post('/api/crear-preferencia', async (req, res) => {
  try {
    const { cantidad } = req.body;
    const unitPrice = Number(process.env.PRECIO_BOLETO) || 4500;

    const preference = await mercadopago.preferences.create({
      items: [{
        title: 'Boletos de rifa',
        quantity: cantidad,
        unit_price: unitPrice
      }],
      back_urls: {
        success: process.env.URL_SUCCESS,
        failure: process.env.URL_FAILURE,
        pending: process.env.URL_PENDING
      },
      auto_return: 'approved'
    });

    res.status(200).json({ success: true, init_point: preference.body.init_point });

  } catch (error) {
    console.error('❌ Error al crear preferencia de Mercado Pago:', error);
    res.status(500).json({ success: false, message: 'Error al crear preferencia' });
  }
});

// Webhook de Mercado Pago
import Ticket from './models/Ticket.js';
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const { type, data } = JSON.parse(req.body.toString('utf8'));
    if (type === 'payment') {
      const payment = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      }).then(r => r.json());

      if (payment.status === 'approved') {
        const ticket = await Ticket.findOneAndUpdate(
          { correo: payment.payer.email },
          { pagado: true }
        );

        if (ticket) {
          await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: process.env.EMAILJS_SERVICE,
              template_id: process.env.EMAILJS_TEMPLATE,
              user_id: process.env.EMAILJS_USER,
              template_params: {
                to_email: ticket.correo,
                nombre: ticket.nombre,
                numeros: ticket.numeros.join(', ')
              }
            })
          });
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error en Webhook de MP:', error);
    res.sendStatus(500);
  }
});

// Login administrador
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect('/admin.html');
  }
  res.send('❌ Usuario o contraseña incorrecta. <a href="/login.html">Volver</a>');
});
// Eliminar ticket por ID
app.delete('/admin/ticket/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Ticket.findByIdAndDelete(id);
    res.status(200).json({ success: true, message: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error eliminando el ticket' });
  }
});
// Middleware de errores
app.use((err, req, res, next) => {
  console.error('Error interno del servidor:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Levantar servidor
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));
