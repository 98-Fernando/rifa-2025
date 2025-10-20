import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema(
  {
    // 🔹 Identificador único de la transacción
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // 🔹 Datos del comprador
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

    // 🔹 Números de rifa comprados
    numeros: {
      type: [String],
      required: true,
    },

    // 🔹 Estado del pago
    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "rechazado"],
      default: "pendiente",
    },

    // 🔹 Datos enviados por Mercado Pago
    idPagoMP: {
      type: String, // ID del pago en Mercado Pago
      default: null,
    },
    metodoPago: {
      type: String, // Tarjeta, PSE, efectivo, etc.
      default: null,
    },
    montoPagado: {
      type: Number,
      default: 0,
    },
    fechaPago: {
      type: Date,
    },

    // 🔹 Control interno
    notificado: {
      type: Boolean, // true si ya se envió el correo al comprador
      default: false,
    },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt automáticamente
  }
);

// ✅ Índice para búsquedas rápidas por estado
TicketSchema.index({ estadoPago: 1 });

// ✅ Limpieza automática: convierte en minúsculas el correo y referencia
TicketSchema.pre("save", function (next) {
  if (this.correo) this.correo = this.correo.toLowerCase();
  if (this.reference) this.reference = this.reference.trim();
  next();
});

export default mongoose.model("Ticket", TicketSchema);
