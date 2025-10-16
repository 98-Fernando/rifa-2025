import { Router } from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";

const router = Router();

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const isAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ exito: false, mensaje: "No autorizado" });
};

// ==================== OBTENER TODOS LOS TICKETS ====================
// GET /api/admin/tickets
router.get("/tickets", isAdmin, async (req, res) => {
  try {
    // Tickets pagados
    const ticketsPagados = await Ticket.find({}).lean();

    // Tickets pendientes
    const ticketsPendientes = await Pendiente.find({}).lean();

    // Normalizamos los pendientes para que tengan el mismo formato
    const precioBoleto = Number(process.env.PRECIO_BOLETO) || 5000;
    const ticketsPendientesMapeados = ticketsPendientes.map((p) => ({
      ...p,
      estadoPago: "pendiente",
      monto: p.numeros?.length ? p.numeros.length * precioBoleto : precioBoleto,
    }));

    // Combinamos y ordenamos (más recientes primero)
    const todos = [...ticketsPagados, ...ticketsPendientesMapeados].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ exito: true, tickets: todos });
  } catch (error) {
    console.error("❌ Error al obtener tickets del admin:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al obtener los tickets." });
  }
});

// ==================== ELIMINAR UN TICKET ====================
// DELETE /api/admin/tickets/:id
router.delete("/tickets/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Intentamos eliminar de ambas colecciones
    let result = await Ticket.findByIdAndDelete(id);
    if (!result) {
      result = await Pendiente.findByIdAndDelete(id);
    }

    if (result) {
      res.json({ exito: true, mensaje: "Registro eliminado correctamente." });
    } else {
      res.status(404).json({ exito: false, mensaje: "Registro no encontrado." });
    }
  } catch (error) {
    console.error("❌ Error al eliminar registro:", error);
    res.status(500).json({ exito: false, mensaje: "Error al eliminar registro." });
  }
});

export default router;
