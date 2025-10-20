import express from "express";
import fetch from "node-fetch";
import Pendiente from "../models/Pendiente.js";
import Ticket from "../models/Ticket.js";
import WebhookLog from "../models/WebhookLog.js";
import { enviarCorreo } from "../services/emailService.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📦 Webhook recibido:", JSON.stringify(body, null, 2));

    // ✅ Guardar log del webhook recibido
    await WebhookLog.create({
      paymentId: body.data?.id || null,
      reference: body.data?.external_reference || null,
      type: body.type || body.topic || "desconocido",
      rawBody: body,
    });

    // ⚙️ Manejar tanto "payment" como "merchant_order"
    let pagoData = null;
    let referencia = null;
    let estado = null;

    if (body.type === "payment" || body.topic === "payment") {
      // 🧾 Consulta directa de pago
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${body.data.id}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      pagoData = await resp.json();
      referencia = pagoData.external_reference;
      estado = pagoData.status;
    } else if (body.topic === "merchant_order") {
      // 📦 Consulta de merchant order
      const resp = await fetch(body.resource, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      const order = await resp.json();

      if (order.payments?.length > 0) {
        const pago = order.payments.find((p) => p.status === "approved");
        if (pago) {
          pagoData = pago;
          referencia = pago.external_reference || order.external_reference;
          estado = pago.status;
        }
      }
    }

    // ⚠️ Si no hay pago confirmado, salir sin error
    if (!pagoData || !referencia) {
      console.log("⚠️ No se encontró información de pago válida.");
      return res.sendStatus(200);
    }

    console.log(`💰 Pago detectado (${referencia}) → Estado: ${estado}`);

    const pendiente = await Pendiente.findOne({ reference: referencia });
    if (!pendiente) {
      console.log("⚠️ No se encontró reserva pendiente con esa referencia.");
      return res.sendStatus(200);
    }

    // 💵 Si el pago fue aprobado, mover a Tickets
    if (estado === "approved") {
      await Ticket.create({
        reference: pendiente.reference,
        nombre: pendiente.nombre,
        correo: pendiente.correo,
        telefono: pendiente.telefono,
        numeros: pendiente.numeros,
        estadoPago: "pagado",
        idPagoMP: pagoData.id,
        metodoPago: pagoData.payment_method_id || "desconocido",
        montoPagado: pagoData.transaction_amount || 0,
        fechaPago: pagoData.date_approved || new Date(),
      });

      await Pendiente.findByIdAndDelete(pendiente._id);

      await enviarCorreo(
        pendiente.correo,
        "✅ Pago confirmado - Rifa 2025",
        `<h2>¡Gracias, ${pendiente.nombre}!</h2>
         <p>Tu pago fue aprobado y tus números quedaron registrados:</p>
         <h3>${pendiente.numeros.join(", ")}</h3>
         <p>¡Mucha suerte en el sorteo! 🍀</p>`
      );

      console.log(`✅ Pago aprobado confirmado para ${pendiente.nombre}`);
    }

    // ❌ Si fue rechazado, eliminar reserva
    if (estado === "rejected") {
      await Pendiente.findByIdAndDelete(pendiente._id);
      await enviarCorreo(
        pendiente.correo,
        "❌ Pago rechazado - Rifa 2025",
        `<p>Hola ${pendiente.nombre}, tu pago fue rechazado. Puedes intentar nuevamente en nuestra página.</p>`
      );
      console.log(`❌ Pago rechazado para ${pendiente.nombre}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.sendStatus(500);
  }
});

export default router;
