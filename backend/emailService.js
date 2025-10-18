// ==================== emailService.js ====================
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ==================== CONFIGURACIÓN DEL TRANSPORTER ====================

// Si usas GMAIL con clave de aplicación:
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.CORREO_APP,
    pass: process.env.CLAVE_APP,
  },
});

// (Alternativa: Mailtrap para pruebas)
// const transporter = nodemailer.createTransport({
//   host: "smtp.mailtrap.io",
//   port: 2525,
//   auth: {
//     user: process.env.MAIL_USER,
//     pass: process.env.MAIL_PASS,
//   },
// });

// ==================== FUNCIÓN PARA ENVIAR CORREO ====================
export async function enviarCorreo(destinatario, asunto, mensajeHTML) {
  try {
    const mailOptions = {
      from: `"Rifas Sorteos" <${process.env.CORREO_APP}>`,
      to: destinatario,
      subject: asunto,
      html: mensajeHTML,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Correo enviado:", info.messageId);
    return true;
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    return false;
  }
}
