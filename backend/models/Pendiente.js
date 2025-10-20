import mongoose from "mongoose";

const PendienteSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true, // Asegura que cada referencia sea única
      trim: true,
    },
    nombre: { type: String, required: true, trim: true },
    correo: { type: String, required: true, lowercase: true, trim: true },
    telefono: { type: String, required: true, trim: true },
    numeros: { type: [String], required: true },
    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "rechazado"],
      default: "pendiente",
    },
    creadoEn: { type: Date, default: Date.now },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt
  }
);

PendienteSchema.pre("save", function (next) {
  if (this.correo) this.correo = this.correo.toLowerCase();
  if (this.reference) this.reference = this.reference.trim();
  next();
});

export default mongoose.model("Pendiente", PendienteSchema);
