import mongoose from "mongoose";

const PendienteSchema = new mongoose.Schema({
    reference: { type: String, required: true, unique: true }, // Referencia del ticket (ej: RIFA-163456789)
    nombre: { type: String, required: true },
    correo: { type: String, required: true },
    telefono: { type: String, required: true },
    numeros: { type: [String], required: true }, 
    creadoEn: { type: Date, default: Date.now },
}, {
    timestamps: true // añade createdAt y updatedAt
});

export default mongoose.model("Pendiente", PendienteSchema);
