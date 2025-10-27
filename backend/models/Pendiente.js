import mongoose from "mongoose";

const PendienteSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // 🔹 ayuda a búsquedas más rápidas
    },
    nombre: { type: String, required: true, trim: true },
    correo: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Correo inválido"], // 🔹 validación de formato
    },
    telefono: { type: String, required: true, trim: true },
    numeros: {
      type: [String],
      required: true,
      validate: [
        arr => arr.length > 0,
        "Debe contener al menos un número de rifa",
      ], // 🔹 evita arrays vacíos
    },
    estadoPago: {
      type: String,
      enum: ["pendiente", "pagado", "rechazado"],
      default: "pendiente",
    },
    creadoEn: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// 🔹 Limpieza y normalización antes de guardar
PendienteSchema.pre("save", function (next) {
  if (this.correo) this.correo = this.correo.toLowerCase();
  if (this.reference) this.reference = this.reference.trim();
  next();
});

const Pendiente = mongoose.model("Pendiente", PendienteSchema);
export default Pendiente;
