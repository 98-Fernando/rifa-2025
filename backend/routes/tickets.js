import { Router } from 'express';
import fetch from 'node-fetch';
import Ticket from '../models/Ticket.js';

const router = Router();
const TOTAL_NUMEROS = 1000;
const pendientes = new Map();

// Llaves Wompi Sandbox
const PUBLIC_KEY = "pub_test_GLb9rOhET4NH5NKy7UPz6vGGhGBxkFqU";
const PRIVATE_KEY = "prv_test_xi8BMJJacIAh8VwSBiWz2QC5g8SomCij";

// ─── Función auxiliar ─────────────────────────────
async function obtenerNumerosOcupados() {
  const boletos = await Ticket.find({}, 'numeros -_id');
  return new Set(boletos.flatMap(t => t.numeros));
}

// ─── Rutas existentes (sin cambios grandes) ──────
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json({ exito: true, tickets });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener tickets' });
  }
});

router.get('/disponibles', async (req, res) => {
  try {
    const usados = await obtenerNumerosOcupados();
    const disponibles = [];
    for (let i = 0; i < TOTAL_NUMEROS; i++) {
      const num = i.toString().padStart(3, '0');
      if (!usados.has(num)) disponibles.push(num);
    }
    res.json({ exito: true, disponibles });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener disponibles' });
  }
});

router.get('/consulta', async (req, res) => {
  try {
    const tickets = await Ticket.find();
    const vendidos = tickets.reduce((sum, t) => sum + t.numeros.length, 0);
    const porcentaje = Math.floor((vendidos / TOTAL_NUMEROS) * 100);
    res.json({ exito: true, vendidos, porcentaje });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al consultar progreso' });
  }
});

router.get('/numeros', async (req, res) => {
  try {
    const usados = await obtenerNumerosOcupados();
    const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => {
      const numero = i.toString().padStart(3, '0');
      return { numero, disponible: !usados.has(numero) };
    });
    res.json({ exito: true, numeros });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener estado de números' });
  }
});

// ─── POST /api/tickets → Iniciar compra ───────────
router.post('/', async (req, res) => {
  const { nombre, correo, telefono, numeros } = req.body;
  if (!nombre || !correo || !telefono || !Array.isArray(numeros) || numeros.length === 0) {
    return res.status(400).json({ exito: false, mensaje: 'Datos incompletos o sin números seleccionados.' });
  }

  try {
    const usados = await obtenerNumerosOcupados();
    const repetidos = numeros.filter(n => usados.has(n));
    if (repetidos.length) {
      return res.status(409).json({
        exito: false,
        mensaje: `Los números ${repetidos.join(', ')} ya están ocupados.`
      });
    }

    const transaction_reference = `ticket_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    pendientes.set(transaction_reference, { nombre, correo, telefono, numeros });

    res.json({
      exito: true,
      mensaje: 'Referencia generada, procede al pago con Wompi.',
      referencia: transaction_reference
    });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al iniciar ticket' });
  }
});

// ─── WEBHOOK /api/tickets/webhook (Wompi) ────────
router.post('/webhook', async (req, res) => {
  try {
    const evento = req.body.event;
    const data = req.body.data?.transaction;

    if (!data) return res.status(400).json({ exito: false, mensaje: 'Transacción inválida.' });

    const referencia = data.reference;
    const estado = data.status;

    if (estado === 'APPROVED' && pendientes.has(referencia)) {
      const datos = pendientes.get(referencia);

      // Guardamos ticket
      const nuevo = new Ticket(datos);
      await nuevo.save();

      pendientes.delete(referencia);
      console.log(`✅ Ticket confirmado: ${referencia}`);

    } else if (estado === 'DECLINED') {
      pendientes.delete(referencia);
      console.log(`❌ Pago rechazado: ${referencia}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Error en webhook:', error);
    res.status(500).json({ exito: false, mensaje: 'Error en webhook' });
  }
});

// ─── DELETE ticket ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const eliminado = await Ticket.findByIdAndDelete(req.params.id);
    if (!eliminado) {
      return res.status(404).json({ exito: false, mensaje: 'Ticket no encontrado' });
    }
    res.json({ exito: true, mensaje: '🗑️ Ticket eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al eliminar ticket' });
  }
});

export default router;
