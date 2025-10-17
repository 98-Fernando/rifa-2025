// routes/tickets.js
import { Router } from 'express';
import Ticket from '../models/Ticket.js';
import Pendiente from '../models/Pendiente.js';

const router = Router();
const TOTAL_NUMEROS = 1000;

// ─── Función auxiliar ─────────────────────────────
/** Obtiene un Set de todos los números ocupados (pagados) */
async function obtenerNumerosOcupados() {
  const boletos = await Ticket.find({}, 'numeros -_id').lean();
  return new Set(boletos.flatMap(t => t.numeros));
}

// ─── GET /api/tickets ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json({ exito: true, tickets });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener tickets' });
  }
});

// ─── GET /api/tickets/numeros ─────────────────────
router.get('/numeros', async (req, res) => {
  try {
    const usados = await obtenerNumerosOcupados();
    const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => {
      const numero = i.toString().padStart(3, '0');
      return { numero, disponible: !usados.has(numero) };
    });
    res.json({ exito: true, numeros });
  } catch (error) {
    console.error("❌ Error obteniendo números:", error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al obtener estado de números' });
  }
});

// ─── GET /api/tickets/consulta ────────────────────
router.get('/consulta', async (req, res) => {
  try {
    const tickets = await Ticket.find({}, 'numeros').lean();
    const vendidos = tickets.reduce((sum, t) => sum + (t.numeros?.length || 0), 0);
    const porcentaje = Math.min(100, Math.floor((vendidos / TOTAL_NUMEROS) * 100));
    res.json({ exito: true, vendidos, porcentaje });
  } catch (error) {
    console.error("❌ Error consulta:", error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al consultar progreso' });
  }
});

// ─── POST /api/tickets/guardar-pendiente ──────────
router.post('/guardar-pendiente', async (req, res) => {
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

    const transaction_reference = `RIFA-${Date.now()}`;

    await Pendiente.create({
      nombre,
      correo,
      telefono,
      numeros,
      reference: transaction_reference,
    });

    res.json({
      exito: true,
      mensaje: 'Números reservados. Procede al pago con Mercado Pago.',
      reference: transaction_reference
    });
  } catch (error) {
    console.error("❌ Error guardando pendiente:", error);
    res.status(500).json({ exito: false, mensaje: 'Error interno al guardar la reserva' });
  }
});

// ─── DELETE /api/tickets/:id ──────────────────────
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


// ─── Compatibilidad con rutas antiguas ─────────────
// (si el frontend llama /api/numeros o /api/consulta, redirigimos)
router.get('/../numeros', (req, res) => res.redirect('/api/tickets/numeros'));
router.get('/../consulta', (req, res) => res.redirect('/api/tickets/consulta'));

// En algunos servidores, redirigir con "../" puede no funcionar igual;
// así que también incluimos un fallback directo:
router.get('/api/numeros', async (req, res) => {
  const usados = await obtenerNumerosOcupados();
  const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => ({
    numero: i.toString().padStart(3, '0'),
    disponible: !usados.has(i.toString().padStart(3, '0')),
  }));
  res.json({ exito: true, numeros });
});

router.get('/api/consulta', async (req, res) => {
  const tickets = await Ticket.find({}, 'numeros').lean();
  const vendidos = tickets.reduce((sum, t) => sum + (t.numeros?.length || 0), 0);
  const porcentaje = Math.min(100, Math.floor((vendidos / TOTAL_NUMEROS) * 100));
  res.json({ exito: true, vendidos, porcentaje });
});

export default router;
