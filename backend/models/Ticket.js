import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nombre: { type: String, required: true, trim: true },
    correo: { type: String, required: true, lowercase: true, trim: true },
    telefono: { type: String, required: true, trim: true },
    numeros: { type: [String], required: true },

    // ✅ Estado de pago booleano: true = pagado, false = cancelado
estadoPago: {
  type: String,
  enum: ["pendiente", "pagado", "fallido"],
  default: "pendiente",
}

    // Datos del pago
    idPagoMP: { type: String, default: null },
    metodoPago: { type: String, default: null },
    montoPagado: { type: Number, default: 0 },
    fechaPago: { type: Date },

    notificado: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Índice por estado de pago
TicketSchema.index({ estadoPago: 1 });

TicketSchema.pre("save", function (next) {
  if (this.correo) this.correo = this.correo.toLowerCase();
  if (this.reference) this.reference = this.reference.trim();
  next();
});

export default mongoose.model("Ticket", TicketSchema);
