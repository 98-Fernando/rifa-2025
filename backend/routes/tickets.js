import { Router } from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";
import { enviarCorreo } from "../emailService.js";

const router = Router();
const TOTAL_NUMEROS = 1000;

// ─── FUNCIÓN AUXILIAR ─────────────────────────────
async function obtenerNumerosEstado() {
  const boletosPagados = await Ticket.find({}, "numeros -_id").lean();
  const boletosPendientes = await Pendiente.find({}, "numeros -_id").lean();

  const pagados = new Set();
  const pendientes = new Set();

  boletosPagados.forEach((b) =>
    b.numeros?.forEach((n) => pagados.add(n.toString().padStart(3, "0")))
  );
  boletosPendientes.forEach((b) =>
    b.numeros?.forEach((n) => pendientes.add(n.toString().padStart(3, "0")))
  );

  return { pagados, pendientes };
}

// ─── GET: /api/tickets ─────────────────────────────
router.get("/", async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json({ exito: true, tickets });
  } catch (error) {
    console.error("❌ Error obteniendo tickets:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al obtener tickets." });
  }
});

// ─── GET: /api/tickets/numeros ─────────────────────
router.get("/numeros", async (req, res) => {
  try {
    const { pagados, pendientes } = await obtenerNumerosEstado();

    const numeros = Array.from({ length: TOTAL_NUMEROS }, (_, i) => {
      const numero = i.toString().padStart(3, "0");
      if (pagados.has(numero)) return { numero, estado: "ocupado" };
      if (pendientes.has(numero)) return { numero, estado: "pendiente" };
      return { numero, estado: "disponible" };
    });

    res.json(numeros);
  } catch (error) {
    console.error("❌ Error obteniendo números:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al obtener números." });
  }
});

// ─── GET: /api/tickets/consulta ────────────────────
router.get("/consulta", async (req, res) => {
  try {
    const tickets = await Ticket.find({}, "numeros").lean();
    const vendidos = tickets.reduce(
      (sum, t) => sum + (t.numeros?.length || 0),
      0
    );
    const porcentaje = Math.min(100, Math.floor((vendidos / TOTAL_NUMEROS) * 100));
    res.json({ exito: true, vendidos, porcentaje });
  } catch (error) {
    console.error("❌ Error en /consulta:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al consultar progreso." });
  }
});

// ─── POST: /api/tickets/guardar-pendiente ──────────
router.post("/guardar-pendiente", async (req, res) => {
  const { nombre, correo, telefono, numeros } = req.body;

  if (
    !nombre ||
    !correo ||
    !telefono ||
    !Array.isArray(numeros) ||
    numeros.length === 0
  ) {
    return res.status(400).json({
      exito: false,
      mensaje: "Datos incompletos o sin números seleccionados.",
    });
  }

  try {
    const { pagados, pendientes } = await obtenerNumerosEstado();
    const repetidos = numeros.filter((n) => {
      const normalizado = n.toString().padStart(3, "0");
      return pagados.has(normalizado) || pendientes.has(normalizado);
    });

    if (repetidos.length) {
      return res.status(409).json({
        exito: false,
        mensaje: `Los números ${repetidos.join(", ")} ya están ocupados o pendientes.`,
      });
    }

    const transaction_reference = `RIFA-${Date.now()}`;
    const numerosFormateados = numeros.map((n) => n.toString().padStart(3, "0"));

    await Pendiente.create({
      nombre,
      correo,
      telefono,
      numeros: numerosFormateados,
      reference: transaction_reference,
    });

    res.json({
      exito: true,
      mensaje: "Números reservados temporalmente. Se envió correo de confirmación.",
      reference: transaction_reference,
    });
  } catch (error) {
    console.error("❌ Error guardando pendiente:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al guardar la reserva." });
  }
});

// ─── POST: /api/tickets/confirmar-pago ─────────────
router.post("/confirmar-pago", async (req, res) => {
  const { idPendiente, idPagoMP } = req.body;

  if (!idPendiente || !idPagoMP) {
    return res.status(400).json({
      exito: false,
      mensaje: "Faltan datos: idPendiente o idPagoMP.",
    });
  }

  try {
    const pendiente = await Pendiente.findById(idPendiente);
    if (!pendiente)
      return res
        .status(404)
        .json({ exito: false, mensaje: "Reserva no encontrada." });

    const reference = pendiente.reference;

    // ✅ Verificar si el idPagoMP o la referencia ya fueron registrados
    const existe = await Ticket.findOne({
      $or: [{ reference }, { idPagoMP }],
    });

    if (existe) {
      console.log(`⚠️ Pago duplicado detectado (ref: ${reference}, idPagoMP: ${idPagoMP}).`);
      return res.json({
        exito: false,
        mensaje: "El pago ya fue confirmado previamente.",
      });
    }

    // ✅ Crear el nuevo ticket con idPagoMP
    const nuevoTicket = await Ticket.create({
      nombre: pendiente.nombre,
      correo: pendiente.correo,
      telefono: pendiente.telefono,
      numeros: pendiente.numeros,
      reference,
      idPagoMP, // ← Guardamos el ID de Mercado Pago
    });

    // ✅ Eliminar la reserva pendiente
    await Pendiente.findByIdAndDelete(idPendiente);

    // ✅ Enviar correo de confirmación
    await enviarCorreo(
      pendiente.correo,
      "✅ Pago confirmado - Rifa",
      `
        <h2>¡Gracias ${pendiente.nombre}! 🎉</h2>
        <p>Tu pago ha sido confirmado correctamente.</p>
        <p>Tus números activos son:</p>
        <h3>${pendiente.numeros.join(", ")}</h3>
        <p><b>Referencia:</b> ${reference}</p>
        <p><b>ID de pago (Mercado Pago):</b> ${idPagoMP}</p>
        <p>🍀 ¡Mucha suerte y gracias por participar!</p>
      `
    );

    res.json({
      exito: true,
      mensaje: "Pago confirmado, ticket creado y correo enviado.",
      ticket: nuevoTicket,
    });
  } catch (error) {
    console.error("❌ Error confirmando pago:", error);
    res.status(500).json({ exito: false, mensaje: "Error al confirmar el pago." });
  }
});

// ─── DELETE: /api/tickets/:id ──────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const eliminado = await Ticket.findByIdAndDelete(req.params.id);
    if (!eliminado)
      return res
        .status(404)
        .json({ exito: false, mensaje: "Ticket no encontrado." });

    res.json({ exito: true, mensaje: "🗑️ Ticket eliminado correctamente." });
  } catch (error) {
    console.error("❌ Error eliminando ticket:", error);
    res
      .status(500)
      .json({ exito: false, mensaje: "Error interno al eliminar ticket." });
  }
});

export default router;

// ─── GET: /api/tickets/estado ───────────────────────
// Consulta el estado de un pago por referencia
router.get("/estado", async (req, res) => {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ exito: false, mensaje: "Referencia no proporcionada." });
  }

  try {
    // Buscar si ya se confirmó (Ticket)
    const ticket = await Ticket.findOne({ reference });
    if (ticket) {
      return res.json({
        exito: true,
        estado: "pagado",
        ticket: {
          nombre: ticket.nombre,
          correo: ticket.correo,
          numeros: ticket.numeros,
          monto: ticket.monto,
        },
      });
    }

    // Si no, revisar si aún está pendiente
    const pendiente = await Pendiente.findOne({ reference });
    if (pendiente) {
      return res.json({
        exito: true,
        estado: pendiente.estadoPago || "pendiente",
      });
    }

    // Si no existe ni pendiente ni ticket, el pago fue rechazado o eliminado
    res.json({ exito: true, estado: "no_encontrado" });
  } catch (error) {
    console.error("❌ Error consultando estado:", error);
    res.status(500).json({ exito: false, mensaje: "Error al consultar el estado del pago." });
  }
});

