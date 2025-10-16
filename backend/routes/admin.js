import { Router } from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";

const router = Router();

// Middleware de autenticación (Necesitas definirlo en server.js o importarlo)
const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ exito: false, mensaje: "No autorizado" });
    }
};

// 1. GET /api/admin/tickets - Obtener todos los tickets (pagados y pendientes)
router.get("/tickets", isAdmin, async (req, res) => {
    try {
        // Obtener tickets pagados
        const ticketsPagados = await Ticket.find({}).lean();

        // Obtener tickets pendientes (reservados)
        const ticketsPendientes = await Pendiente.find({}).lean();

        // Mapear pendientes para que se parezcan a tickets y se puedan mostrar juntos
        const ticketsPendientesMapeados = ticketsPendientes.map(p => ({
            ...p,
            estadoPago: "pendiente",
            monto: (p.numeros.length * (Number(process.env.PRECIO_BOLETO) || 5000))
        }));

        // Combinar y ordenar
        const allTickets = [...ticketsPagados, ...ticketsPendientesMapeados].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );

        res.json({ exito: true, tickets: allTickets });
    } catch (error) {
        console.error("❌ Error al obtener tickets del admin:", error);
        res.status(500).json({ exito: false, mensaje: "Error interno del servidor." });
    }
});

// 2. DELETE /api/admin/tickets/:id - Eliminar un ticket o pendiente
router.delete("/tickets/:id", isAdmin, async (req, res) => {
    try {
        const id = req.params.id;

        // Intentar eliminar como Ticket (pagado)
        let result = await Ticket.findByIdAndDelete(id);

        if (!result) {
            // Si no es un Ticket, intentar eliminar como Pendiente (reservado)
            result = await Pendiente.findByIdAndDelete(id);
        }

        if (result) {
            res.json({ exito: true, mensaje: "Registro eliminado." });
        } else {
            res.status(404).json({ exito: false, mensaje: "Registro no encontrado." });
        }
    } catch (error) {
        console.error("❌ Error al eliminar registro:", error);
        res.status(500).json({ exito: false, mensaje: "Error al eliminar registro." });
    }
});

export default router;
