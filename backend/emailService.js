// ==================== emailService.js ====================
import { Resend } from "resend";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

// ==================== CONFIGURACIÓN DE RESEND ====================
/**
 * Crea una instancia del cliente de Resend.
 * Asegúrate de tener en tu entorno:
 * RESEND_API_KEY=tu_api_key_de_resend
 */
const resend = new Resend(process.env.RESEND_API_KEY);

// ==================== FUNCIÓN PARA ENVIAR CORREO ====================
/**
 * Envía un correo HTML con Resend.
 * @param {string} destinatario - Correo del destinatario.
 * @param {string} asunto - Asunto del correo.
 * @param {string} mensajeHTML - Contenido HTML del mensaje.
 */
export async function enviarCorreo(destinatario, asunto, mensajeHTML) {
  try {
    const { data, error } = await resend.emails.send({
      from: "🎟️ Rifas y Sorteos Popayán <no-reply@resend.dev>", 
      to: destinatario,
      subject: asunto,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 15px; background-color: #f8f9fa; border-radius: 10px;">
          ${mensajeHTML}
          <hr style="margin-top: 20px; border: 0; border-top: 1px solid #ccc;">
          <p style="font-size: 13px; color: #666;">Este es un correo automático, por favor no responder.</p>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Error enviando correo con Resend:", error);
      return false;
    }

    console.log(`📧 Correo enviado correctamente a ${destinatario}: ${data.id}`);
    return true;

  } catch (error) {
    console.error("❌ Error inesperado al enviar correo:", error);
    return false;
  }
}
