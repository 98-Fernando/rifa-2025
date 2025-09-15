import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cargar variables de entorno
dotenv.config();

// Adaptar __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal que sirve el frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Función para conectar a MongoDB con reconexión automática
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
    setTimeout(connectToMongoDB, 5000); // reintenta en 5 segundos
  }
};

// Manejo de desconexión
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Conexión a MongoDB perdida. Intentando reconectar...');
  connectToMongoDB(); // reconectar automáticamente
});

// Manejo de errores de conexión
mongoose.connection.on('error', (err) => {
  console.error('❌ Error en la conexión de MongoDB:', err.message);
});

// Iniciar conexión a la base de datos
connectToMongoDB();

// Importar rutas
import ticketsRouter from './backend/routes/tickets.js';
app.use('/api/tickets', ticketsRouter);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
});
