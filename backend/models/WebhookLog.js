import mongoose from "mongoose";

const WebhookLogSchema = new mongoose.Schema(
  {
    paymentId: { type: String },
    reference: { type: String },
    status: { type: String },
    type: { type: String },
    rawBody: { type: Object }, // Guarda el JSON completo que llega
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("WebhookLog", WebhookLogSchema);
