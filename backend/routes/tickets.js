import { Router } from 'express';
import Ticket from '../models/Ticket.js';
import Pendiente from '../models/Pendiente.js';

const router = Router();
const TOTAL_NUMEROS = 1000;


// ─── Función auxiliar ─────────────────────────────
/** Obtiene un Set de todos los números ocupados (pagados) */
async function obtenerNumerosOcupados() {
    // Usamos el campo 'numeros' que ahora es [String]
    const boletos = await Ticket.find({}, 'numeros -_id').lean();
    return new Set(boletos.flatMap(t => t.numeros));
}

// ─── Rutas de Consulta ─────────────────────────────

router.get('/', async (req, res) => {
    try {
        const tickets = await Ticket.find().sort({ createdAt: -1 });
        res.json({ exito: true, tickets });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: 'Error interno al obtener tickets' });
    }
});

router.get('/numeros', async (req, res) => {
    try {
        const usados = await obtenerNumerosOcupados();
        const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => {
            const numero = i.toString().padStart(3, '0'); // Formato '000' a '999'
            return { numero, disponible: !usados.has(numero) };
        });
        res.json({ exito: true, numeros });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: 'Error interno al obtener estado de números' });
    }
});

router.get('/consulta', async (req, res) => {
    try {
        // Obtenemos el total de números vendidos (no de documentos)
        const tickets = await Ticket.find({}, 'numeros').lean();
        const vendidos = tickets.reduce((sum, t) => sum + (t.numeros?.length || 0), 0);
        
        // El porcentaje ahora se calcula correctamente sobre 1000
        const porcentaje = Math.min(100, Math.floor((vendidos / TOTAL_NUMEROS) * 100)); 
        
        res.json({ exito: true, vendidos, porcentaje });
    } catch (error) {
        res.status(500).json({ exito: false, mensaje: 'Error interno al consultar progreso' });
    }
});


// ─── POST /api/tickets/guardar-pendiente → Reservar números ───────────
// Esta ruta es la que usa app.js para crear la referencia ANTES de ir a Mercado Pago
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

        // Generamos la referencia única que usará Mercado Pago
        const transaction_reference = `RIFA-${Date.now()}`; 
        
        // 💾 Guardamos en la colección Pendiente
        await Pendiente.create({
            nombre, 
            correo, 
            telefono, 
            numeros: numeros, // El frontend asegura que son strings de 3 dígitos
            reference: transaction_reference,
        });

        res.json({
            exito: true,
            mensaje: 'Números reservados. Procede al pago con Mercado Pago.',
            reference: transaction_reference // Enviamos 'reference' para MP
        });
    } catch (error) {
        console.error("❌ Error guardando pendiente:", error);
        res.status(500).json({ exito: false, mensaje: 'Error interno al guardar la reserva' });
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
