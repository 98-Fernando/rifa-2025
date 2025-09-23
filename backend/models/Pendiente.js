import mongoose from "mongoose";

const PendienteSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  correo: { type: String, required: true },
  telefono: { type: String, required: true },
  numeros: { type: [Number], required: true },
  creadoEn: { type: Date, default: Date.now },
});

export default mongoose.model("Pendiente", PendienteSchema);
