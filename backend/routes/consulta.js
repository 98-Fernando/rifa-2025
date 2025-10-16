import { Router } from "express"; // Cambiado de require a import
import Ticket from "../models/Ticket.js"; // Asegúrate que la ruta al modelo sea correcta

const router = Router(); // Cambiado de express.Router() a Router()
const TOTAL_NUMEROS = 1000; // Total de números posibles (000 a 999)

// GET /api/tickets/consulta - Consultar cantidad total de números vendidos y porcentaje
router.get("/consulta", async (req, res) => {
    try {
        // Traer solo los números de los tickets pagados
        const tickets = await Ticket.find({}, "numeros").lean(); // Usamos .lean() para optimizar la lectura

        // Contar cuántos números se han vendido en total
        const totalNumerosVendidos = tickets.reduce((acc, ticket) => acc + (ticket.numeros?.length || 0), 0);

        // Calcular el porcentaje de números vendidos
        const porcentaje = Math.min(100, Math.round((totalNumerosVendidos / TOTAL_NUMEROS) * 100));

        res.status(200).json({
            exito: true,
            total: totalNumerosVendidos,
            porcentaje
        });
    } catch (error) {
        console.error("❌ Error al consultar tickets:", error);
        res.status(500).json({ 
            exito: false, 
            mensaje: "🚫 Error al obtener los tickets" 
        });
    }
});

export default router; // Cambiado de module.exports a export default
