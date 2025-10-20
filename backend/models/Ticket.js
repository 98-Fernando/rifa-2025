import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true, // Referencia única de la compra
      trim: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
    },
    correo: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    telefono: {
      type: String,
      required: true,
      trim: true,
    },
    numeros: {
      type: [String],
      required: true,
    },
    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "rechazado"],
      default: "pendiente",
    },
    idPagoMP: {
      type: String, // ID del pago que Mercado Pago envía
      default: null,
    },
    metodoPago: {
      type: String, // tarjeta, pse, efectivo, etc.
      default: null,
    },
    montoPagado: {
      type: Number,
      default: 0,
    },
    fechaPago: {
      type: Date,
    },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt automáticamente
  }
);

export default mongoose.model("Ticket", TicketSchema);
