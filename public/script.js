
(function(){
  emailjs.init("XPQs4d1K2sHKtcIDl");
})();

document.getElementById("contact-form").addEventListener("submit", function(e) {
  e.preventDefault();

  emailjs.send("service_fcgsd9j", "template_6qvu9xt", {
    from_name: document.getElementById("name").value,
    from_email: document.getElementById("email").value,
    cantidad: document.getElementById("cantidad").value,
    message: document.getElementById("message").value
  }).then(function(response) {
    Swal.fire("¡Enviado!", "Tu mensaje fue enviado con éxito 🚀", "success");
    document.getElementById("contact-form").reset();
  }, function(error) {
    Swal.fire("Error", "Hubo un problema al enviar tu mensaje 😞", "error");
    console.error("Error de EmailJS:", error);
  });
});
