import mongoose from "mongoose";

const PendienteSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true }, // referencia de Wompi
  nombre: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  numeros: { type: [Number], required: true }, // aseguramos que sean números
  creadoEn: { type: Date, default: Date.now },
}, {
  timestamps: true // añade createdAt y updatedAt
});

export default mongoose.model("Pendiente", PendienteSchema);
