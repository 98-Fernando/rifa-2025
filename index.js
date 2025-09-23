// ==============================
// Importaciones
// ==============================
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ==============================
// Configuración de entorno
// ==============================
dotenv.config();

// Adaptar __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================
// Inicializar Express
// ==============================
const app = express();
const PORT = process.env.PORT || 5000;

// ==============================
// Middleware
// ==============================
app.use(express.static(path.join(__dirname, 'public')));

// ==============================
// Rutas
// ==============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Importar rutas de la API
import ticketsRouter from './backend/routes/tickets.js';
app.use('/api/tickets', ticketsRouter);

// ==============================
// Conexión a MongoDB
// ==============================
const connectToMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB conectado correctamente');
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err.message);
    console.log('🔁 Reintentando conexión en 5 segundos...');
    setTimeout(connectToMongoDB, 5000);
  }
};

// Manejo de desconexión
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Conexión a MongoDB perdida. Intentando reconectar...');
  connectToMongoDB();
});

// Manejo de errores
mongoose.connection.on('error', (err) => {
  console.error('❌ Error en la conexión de MongoDB:', err.message);
});

// Iniciar conexión
connectToMongoDB();

// ==============================
// Iniciar servidor
// ==============================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
});
