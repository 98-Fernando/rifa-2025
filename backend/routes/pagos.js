import express from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";
import fetch from "node-fetch";

const router = express.Router();

// 🔔 Ruta Webhook de Mercado Pago
router.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.type !== "payment") return res.sendStatus(200);

    // Traer información completa del pago desde Mercado Pago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${data.data.id}`, {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, // Tu token privado
      },
    });

    const pago = await response.json();

    const estado = pago.status; // "approved", "pending", "rejected"
    const referencia = pago.external_reference; // Debes enviar esta al crear la preferencia
    console.log(`📢 Estado recibido: ${estado} | Referencia: ${referencia}`);

    // Buscar el registro pendiente asociado
    const pendiente = await Pendiente.findOne({ reference: referencia });
    if (!pendiente) return res.sendStatus(200);

    if (estado === "approved") {
      // ✅ Crear el ticket confirmado
      await Ticket.create({
        reference: pendiente.reference,
        nombre: pendiente.nombre,
        correo: pendiente.correo,
        telefono: pendiente.telefono,
        numeros: pendiente.numeros,
        estadoPago: "pagado",
      });

      // Eliminar el pendiente
      await Pendiente.findByIdAndDelete(pendiente._id);

      console.log(`✅ Pago aprobado para ${pendiente.nombre}`);
    }

    if (estado === "rejected") {
      // ❌ Eliminar o liberar reserva
      await Pendiente.findByIdAndDelete(pendiente._id);  
      console.log(`❌ Pago rechazado: ${pendiente.nombre}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

export default router;
