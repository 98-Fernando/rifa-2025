const express = require("express");
const router = express.Router();
const Ticket = require("../models/Ticket");

const TOTAL_NUMEROS = 1000; // Total de números posibles

// GET /api/tickets/consulta - Consultar cantidad total de números vendidos y porcentaje
router.get("/consulta", async (req, res) => {
  try {
    // Traer solo los números de los tickets
    const tickets = await Ticket.find({}, "numeros");

    // Contar cuántos números se han vendido
    const totalNumerosVendidos = tickets.reduce((acc, ticket) => acc + ticket.numeros.length, 0);

    // Calcular el porcentaje de números vendidos
    const porcentaje = Math.round((totalNumerosVendidos / TOTAL_NUMEROS) * 100);

    res.status(200).json({
      exito: true,
      total: totalNumerosVendidos,
      porcentaje 
    });
  } catch (error) {
    console.error("❌ Error al consultar tickets:", error);
    res.status(500).json({ 
      exito: false, 
      mensaje: "🚫 Error al obtener los tickets" 
    });
  }
});

module.exports = router;
