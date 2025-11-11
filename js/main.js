document.getElementById("btnCalcular").addEventListener("click", () => {
  const importe = parseFloat(document.getElementById("importe").value);
  const kwh = parseFloat(document.getElementById("kwh").value);
  if (!importe && !kwh) return alert("Introduce al menos un dato para calcular.");

  let ahorroMensual = 0;
  if (importe) ahorroMensual = importe * 0.15; // 15% estimado
  else if (kwh) ahorroMensual = kwh * 0.03; // ahorro medio estimado

  const resultado = document.getElementById("resultado");
  resultado.innerHTML = `💡 Ahorro estimado: ${ahorroMensual.toFixed(2)} €/mes · ${(ahorroMensual*12).toFixed(0)} €/año`;
  resultado.hidden = false;
});
