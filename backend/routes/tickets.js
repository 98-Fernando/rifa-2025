import { Router } from 'express';
import Ticket from '../models/Ticket.js';

const router = Router();
const TOTAL_NUMEROS = 1000;

// ─── Función auxiliar para obtener números ocupados ───────────────────────────
async function obtenerNumerosOcupados() {
  const boletos = await Ticket.find({}, 'numeros -_id');
  return new Set(boletos.flatMap(t => t.numeros));
}

// ─── GET /api/tickets → Listar todos los tickets ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json({ exito: true, tickets });
  } catch (error) {
    console.error('❌ Error al listar tickets:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener tickets' });
  }
});

// ─── GET /api/tickets/disponibles → Números no asignados ─────────────────────
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
    console.error('❌ Error al obtener números disponibles:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener disponibles' });
  }
});

// ─── GET /api/tickets/consulta → Progreso de ventas ───────────────────────────
router.get('/consulta', async (req, res) => {
  try {
    const tickets = await Ticket.find();
    const vendidos = tickets.reduce((sum, t) => sum + t.numeros.length, 0);
    const porcentaje = Math.floor((vendidos / TOTAL_NUMEROS) * 100);
    res.json({ exito: true, vendidos, porcentaje });
  } catch (error) {
    console.error('❌ Error al consultar progreso:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al consultar progreso' });
  }
});

// ─── GET /api/tickets/numeros → Estado de cada número ─────────────────────────
router.get('/numeros', async (req, res) => {
  try {
    const usados = await obtenerNumerosOcupados();
    const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => {
      const numero = i.toString().padStart(3, '0');
      return { numero, disponible: !usados.has(numero) };
    });
    res.json({ exito: true, numeros });
  } catch (error) {
    console.error('❌ Error al obtener estado de números:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener estado de números' });
  }
});

// ─── POST /api/tickets → Registrar nuevos boletos ─────────────────────────────
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

    const nuevo = new Ticket({ nombre, correo, telefono, numeros });
    await nuevo.save();
    res.json({ exito: true, mensaje: '🎉 ¡Participación registrada!', numeros });
  } catch (error) {
    console.error('❌ Error al registrar ticket:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al registrar ticket' });
  }
});

// ─── DELETE /api/tickets/:id → Eliminar ticket ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const eliminado = await Ticket.findByIdAndDelete(req.params.id);
    if (!eliminado) {
      return res.status(404).json({ exito: false, mensaje: 'Ticket no encontrado' });
    }
    res.json({ exito: true, mensaje: '🗑️ Ticket eliminado correctamente' });
  } catch (error) {
    console.error('❌ Error al eliminar ticket:', error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al eliminar ticket' });
  }
});

export default router;
