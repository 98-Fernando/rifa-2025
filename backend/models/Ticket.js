// ==================== IMPORTACIONES ====================
import mongoose from "mongoose";

// ==================== ESQUEMA DE TICKET ====================
const TicketSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true }, // SIN unique
    nombre: { type: String, required: true },
    correo: { type: String, required: true },
    telefono: { type: String, required: true },
    numeros: { type: [String], required: true },
    monto: { type: Number, required: true },
    fecha: { type: String, required: true },

    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "fallido"],
      default: "pendiente",
    },

    idPagoMP: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Eliminamos índice único si ya existía
TicketSchema.index({ reference: 1 }, { unique: false });

// ==================== EXPORTACIÓN DEL MODELO ====================
const Ticket = mongoose.model("Ticket", TicketSchema);
export default Ticket;
