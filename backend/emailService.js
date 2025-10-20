// ==================== emailService.js ====================
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ==================== CONFIGURACIÓN DEL TRANSPORTER ====================
// Gmail con clave de aplicación (NO tu contraseña normal)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CORREO_APP,
    pass: process.env.CLAVE_APP,
  },
});

// ==================== FUNCIÓN PARA ENVIAR CORREO ====================
export async function enviarCorreo(destinatario, asunto, mensajeHTML) {
  try {
    const mailOptions = {
      from: `"Rifas y Sorteos 🎟️" <${process.env.CORREO_APP}>`,
      to: destinatario,
      subject: asunto,
      html: mensajeHTML,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Correo enviado correctamente:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    return false;
  }
}
