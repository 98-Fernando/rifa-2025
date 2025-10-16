document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorMessage = document.getElementById("errorMessage");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMessage.textContent = ""; // Limpia errores previos

    const username = form.username.value.trim();
    const password = form.password.value.trim();

    if (!username || !password) {
      errorMessage.textContent = "Por favor completa todos los campos.";
      return;
    }

    try {
      const response = await fetch("https://rifa-2025.onrender.com/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        // ✅ Login exitoso: redirigir al panel admin
        window.location.href = "https://rifa-2025.onrender.com/admin.html";
      } else if (response.status === 401) {
        errorMessage.textContent = "Usuario o contraseña incorrectos.";
      } else {
        errorMessage.textContent = data.mensaje || "Error en el servidor. Intenta nuevamente.";
      }
    } catch (err) {
      console.error("❌ Error de red:", err);
      errorMessage.textContent = "No se pudo conectar con el servidor.";
    }
  });
});
