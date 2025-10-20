import mongoose from "mongoose";

const WebhookLogSchema = new mongoose.Schema(
  {
    paymentId: { type: String },
    reference: { type: String },
    status: { type: String },
    type: { type: String },
    rawBody: { type: Object },
  },
  { timestamps: true }
);

// Índice para ordenar y buscar rápido por tipo o referencia
WebhookLogSchema.index({ createdAt: -1, type: 1 });

export default mongoose.model("WebhookLog", WebhookLogSchema);
