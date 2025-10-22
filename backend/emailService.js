// ==================== emailService.js ====================
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Carga directa de las variables de entorno
dotenv.config();

// ==================== CONFIGURACIÓN DEL TRANSPORTER ====================
// Usa Gmail con clave de aplicación (no la contraseña normal)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true = usa SSL
  auth: {
    user: process.env.CORREO_APP,
    pass: process.env.CLAVE_APP,
  },
});

// ==================== VERIFICAR CONEXIÓN AL SERVIDOR SMTP ====================
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Error al conectar con el servidor SMTP:", error);
  } else {
    console.log("✅ Servidor de correo listo para enviar mensajes.");
  }
});

// ==================== FUNCIÓN PARA ENVIAR CORREO ====================
/**
 * Envía un correo con HTML al destinatario indicado.
 * @param {string} destinatario - Correo del destinatario.
 * @param {string} asunto - Asunto del correo.
 * @param {string} mensajeHTML - Contenido HTML del mensaje.
 */
export async function enviarCorreo(destinatario, asunto, mensajeHTML) {
  try {
    const mailOptions = {
      from: `"🎟️ Rifas y Sorteos Popayán" <${process.env.CORREO_APP}>`,
      to: destinatario,
      subject: asunto,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 15px; background-color: #f8f9fa; border-radius: 10px;">
          ${mensajeHTML}
          <hr style="margin-top: 20px; border: 0; border-top: 1px solid #ccc;">
          <p style="font-size: 13px; color: #666;">Este es un correo automático, por favor no responder.</p>
        </div>
      `,
      replyTo: process.env.CORREO_APP,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Correo enviado correctamente a ${destinatario}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
    return false;
  }
}
