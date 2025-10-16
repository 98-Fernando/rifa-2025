import mongoose from "mongoose";

const TicketSchema = new mongoose.Schema({
    reference: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    correo: { type: String, required: true },
    telefono: { type: String, required: true },
    numeros: { type: [String], required: true }, 
    estadoPago: {
        type: String,
        enum: ["pendiente", "pagado"],
        default: "pendiente"
    },
    fecha: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

export default mongoose.model("Ticket", TicketSchema);
