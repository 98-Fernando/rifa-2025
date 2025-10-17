import { Router } from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";

const router = Router();

// ==================== MIDDLEWARE DE AUTENTICACIÓN ====================
const isAdmin = (req, res, next) => {
  if (req.session?.isAdmin) {
    return next();
  }

  // Si es una API, respondemos JSON (evita el error "Unexpected token '<'")
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(403).json({ exito: false, mensaje: "No autorizado" });
  }

  // Si viene del navegador (no fetch), redirigimos
  return res.redirect("/login.html");
};

// ==================== OBTENER TODOS LOS TICKETS ====================
// GET /api/admin/tickets
router.get("/tickets", isAdmin, async (req, res) => {
  try {
    const ticketsPagados = await Ticket.find({}).lean();
    const ticketsPendientes = await Pendiente.find({}).lean();

    const precioBoleto = Number(process.env.PRECIO_BOLETO) || 5000;

    const ticketsPendientesMapeados = ticketsPendientes.map((p) => ({
      _id: p._id,
      nombre: p.nombre,
      correo: p.correo,
      telefono: p.telefono,
      numeros: p.numeros,
      monto: p.numeros?.length ? p.numeros.length * precioBoleto : precioBoleto,
      createdAt: p.createdAt,
      estadoPago: "Pendiente",
    }));

    const ticketsPagadosMapeados = ticketsPagados.map((t) => ({
      _id: t._id,
      nombre: t.nombre,
      correo: t.correo,
      telefono: t.telefono,
      numeros: t.numeros,
      monto: t.monto,
      createdAt: t.createdAt,
      estadoPago: "Pagado",
    }));

    const todos = [...ticketsPagadosMapeados, ...ticketsPendientesMapeados].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ exito: true, tickets: todos });
  } catch (error) {
    console.error("❌ Error al obtener tickets del admin:", error);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al obtener los tickets.",
    });
  }
});

// ==================== ELIMINAR UN TICKET ====================
// DELETE /api/admin/tickets/:id
router.delete("/tickets/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    let eliminado = await Ticket.findByIdAndDelete(id);
    if (!eliminado) {
      eliminado = await Pendiente.findByIdAndDelete(id);
    }

    if (!eliminado) {
      return res
        .status(404)
        .json({ exito: false, mensaje: "Registro no encontrado." });
    }

    res.json({ exito: true, mensaje: "Registro eliminado correctamente." });
  } catch (error) {
    console.error("❌ Error al eliminar registro:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error al eliminar registro." });
  }
});

export default router;
