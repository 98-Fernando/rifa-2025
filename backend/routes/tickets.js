import { Router } from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";

const router = Router();
const TOTAL_NUMEROS = 1000;

// ─── FUNCIÓN AUXILIAR ─────────────────────────────
/** Obtiene todos los números ocupados (pagados) y pendientes de la BD */
async function obtenerNumerosEstado() {
  const boletosPagados = await Ticket.find({}, "numeros -_id").lean();
  const boletosPendientes = await Pendiente.find({}, "numeros -_id").lean();

  const pagados = new Set();
  const pendientes = new Set();

  // Normalizamos formato: 1 → "001"
  boletosPagados.forEach((b) =>
    b.numeros?.forEach((n) => pagados.add(n.toString().padStart(3, "0")))
  );

  boletosPendientes.forEach((b) =>
    b.numeros?.forEach((n) => pendientes.add(n.toString().padStart(3, "0")))
  );

  return { pagados, pendientes };
}

// ─── RUTA: GET /api/tickets ────────────────────────
router.get("/", async (req, res) => {
  try {
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    res.json({ exito: true, tickets });
  } catch (error) {
    console.error("❌ Error obteniendo tickets:", error);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al obtener tickets.",
    });
  }
});

// ─── RUTA: GET /api/tickets/numeros ────────────────
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
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al obtener números.",
    });
  }
});

// ─── RUTA: GET /api/tickets/consulta ───────────────
router.get("/consulta", async (req, res) => {
  try {
    const tickets = await Ticket.find({}, "numeros").lean();
    const vendidos = tickets.reduce(
      (sum, t) => sum + (t.numeros?.length || 0),
      0
    );
    const porcentaje = Math.min(
      100,
      Math.floor((vendidos / TOTAL_NUMEROS) * 100)
    );

    res.json({ exito: true, vendidos, porcentaje });
  } catch (error) {
    console.error("❌ Error en /consulta:", error);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al consultar progreso.",
    });
  }
});

// ─── RUTA: POST /api/tickets/guardar-pendiente ─────
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

    await Pendiente.create({
      nombre,
      correo,
      telefono,
      numeros: numeros.map((n) => n.toString().padStart(3, "0")),
      reference: transaction_reference,
    });

    res.json({
      exito: true,
      mensaje: "Números reservados temporalmente. Procede al pago.",
      reference: transaction_reference,
    });
  } catch (error) {
    console.error("❌ Error guardando pendiente:", error);
    res.status(500).json({
      exito: false,
      mensaje: "Error interno al guardar la reserva.",
    });
  }
});

// ─── RUTA: DELETE /api/tickets/:id ─────────────────
router.delete("/:id", async (req, res) => {
  try {
    const eliminado = await Ticket.findByIdAndDelete(req.params.id);
    if (!eliminado) {
