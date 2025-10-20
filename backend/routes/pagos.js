import express from "express";
import Ticket from "../models/Ticket.js";
import Pendiente from "../models/Pendiente.js";
import fetch from "node-fetch";
import { enviarCorreo } from "../services/emailService.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.type !== "payment" || !data.data?.id) {
      console.log("⚠️ Webhook ignorado: sin pago o sin ID");
      return res.sendStatus(200);
    }

    // Obtener datos completos del pago
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${data.data.id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      }
    );
    const pago = await response.json();

    const estado = pago.status;
    const referencia = pago.external_reference;

    console.log(`📢 Estado recibido: ${estado} | Referencia: ${referencia}`);

    const pendiente = await Pendiente.findOne({ reference: referencia });
    if (!pendiente) return res.sendStatus(200);

    if (estado === "approved") {
      await Ticket.create({
        reference: pendiente.reference,
        nombre: pendiente.nombre,
        correo: pendiente.correo,
        telefono: pendiente.telefono,
        numeros: pendiente.numeros,
        estadoPago: "pagado",
        idPagoMP: pago.id,
        metodoPago: pago.payment_method_id,
        montoPagado: pago.transaction_amount,
        fechaPago: pago.date_approved,
      });

      await Pendiente.findByIdAndDelete(pendiente._id);

      await enviarCorreo(
        pendiente.correo,
        "✅ Pago confirmado - Rifa 2025",
        `<h3>¡Gracias, ${pendiente.nombre}!</h3>
         <p>Tu pago fue aprobado correctamente.</p>
         <p>Números: ${pendiente.numeros.join(", ")}</p>`
      );

      console.log(`✅ Pago aprobado para ${pendiente.nombre}`);
    }

    if (estado === "rejected") {
      await Pendiente.findByIdAndDelete(pendiente._id);

      await enviarCorreo(
        pendiente.correo,
        "❌ Pago rechazado - Rifa 2025",
        `<p>Hola ${pendiente.nombre}, tu pago fue rechazado.</p>`
      );

      console.log(`❌ Pago rechazado: ${pendiente.nombre}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

export default router;
