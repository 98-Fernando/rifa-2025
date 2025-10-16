<script>
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMessage = document.getElementById('errorMessage');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = '';

    const username = form.username.value.trim();
    const password = form.password.value.trim();

    if (!username || !password) {
      errorMessage.textContent = 'Por favor, completa todos los campos.';
      return;
    }

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        // Intentamos leer JSON, si no hay contenido (204), igual redirigimos
        try {
          const data = await res.json();
          if (data.success) {
            window.location.href = "/admin.html"; 
            return;
          }
        } catch {
          // Si no hay cuerpo (204), asumimos login exitoso
          window.location.href = "/admin.html";
          return;
        }

        errorMessage.textContent = 'Error desconocido.';
      } else if (res.status === 401) {
        errorMessage.textContent = 'Usuario o contraseña incorrectos.';
      } else {
        errorMessage.textContent = 'Error interno del servidor. Intenta de nuevo.';
      }
    } catch (error) {
      console.error("Error de conexión:", error);
      errorMessage.textContent = 'Error de conexión con el servidor.';
    }
  });
});
</script>
