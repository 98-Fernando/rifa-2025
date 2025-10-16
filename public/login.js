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
        credentials: 'include', // 🔑 Permite guardar la sesión
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        if (res.status === 401) {
          errorMessage.textContent = 'Usuario o contraseña incorrectos.';
        } else {
          errorMessage.textContent = 'Error interno del servidor. Intenta de nuevo.';
        }
        return;
      }

      const data = await res.json();

      if (data.success) {
        // 🔒 Redirige al panel de administración
        window.location.replace('/admin.html');
      } else {
        errorMessage.textContent = data.mensaje || 'Error al iniciar sesión.';
      }

    } catch (error) {
      console.error('❌ Error de conexión:', error);
      errorMessage.textContent = 'No se pudo conectar con el servidor.';
    }
  });
});
</script>
