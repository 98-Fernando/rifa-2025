// ==================== IMPORTACIONES ====================
import mongoose from "mongoose";

// ==================== ESQUEMA DE TICKET ====================
const TicketSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  numeros: { type: [String], required: true },
  monto: { type: Number, required: true },
  fecha: { type: String, required: true },

  // Estado del pago: pendiente, pagado, fallido
  estadoPago: {
    type: String,
    enum: ["pendiente", "pagado", "fallido"],
    default: "pendiente",
  },

  // ID del pago generado por Mercado Pago
  idPagoMP: { type: String, default: null },
});

// ==================== EXPORTACIÓN DEL MODELO ====================
const Ticket = mongoose.model("Ticket", TicketSchema);
export default Ticket;
