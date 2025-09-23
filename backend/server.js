// Endpoint para generar la firma de integridad
// OJO: Esta firma NO se manda en el checkout URL, sirve si usas API/Widget
app.post("/api/generar-firma", (req, res) => {
  try {
    const { cantidad } = req.body;
    const unitPrice = Number(process.env.PRECIO_BOLETO) || 5000; // en pesos
    const amountInPesos = cantidad * unitPrice;
    const amountInCents = amountInPesos * 100; // Wompi espera CENTAVOS
    const reference = `ORDER_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const integritySignature = generarFirma(
      reference,
      amountInCents,
      "COP",
      process.env.WOMPI_INTEGRITY_KEY
    );

    res.json({
      reference,
      amountInPesos,
      amountInCents,
      currency: "COP",
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      signature: integritySignature,
    });
  } catch (error) {
    console.error("❌ Error generando firma:", error);
    res.status(500).json({ error: "Error generando firma" });
  }
});
