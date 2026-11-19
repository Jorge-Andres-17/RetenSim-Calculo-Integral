# RetenSim — Simulador de cálculo integral

Sitio estático, diseñado para presentar la tercera entrega de Cálculo Integral. Responsive: incluye introducción, modelos matemáticos, simulación de cuatro escenarios, convergencia de Simpson y trapecios, costos de acompañamiento y análisis de viabilidad bajo supuestos.


## Escenario de referencia

Cuota 60.000 COP/mes, duración 20 meses, tasa de abandono base 0,1/mes. A: descuento 10 %, riesgo 0,08/mes. B: reducción inicial relativa de riesgo 50 %, decaimiento en 6 meses y costo inicial de 5.000 COP por cliente activo-mes. C: tasa de solicitud 0,1/mes, aceptación 20 %, costo por solicitud 15.000 COP. Cohorte operativa: 600 clientes; 120 horas productivas/asesor-mes; 25.000 COP/hora.

Resultados aproximados por cliente: base 518.798,83 COP; A 538.719,85 COP; B 596.480,57 COP; C 583.613,17 COP. Para B con 20 subintervalos: Simpson 596.479,59 COP y trapecios 596.552,49 COP. La referencia se aproxima con Simpson compuesto de 4096 divisiones; no equivale a datos reales.

## Precauciones

- Los parámetros son didácticos, no valores reales de Claro Colombia.
- Los gastos operativos flexibles son la interpretación en horas del costo de B, no un costo adicional: no se descuentan dos veces.
- El escenario de asesor fijo asume contratar asesores enteros durante todo el horizonte; ignora contratación a plazos variables y se usa para demostrar sensibilidad operativa.
- La convergencia numérica comprueba consistencia del algoritmo, no eficacia empresarial.
- Los gráficos y los valores se actualizan al mover los controles. Los datos se exportan en CSV compatible con Excel.

## Pruebas básicas sugeridas

1. Restablecer parámetros y comprobar los cuatro valores anteriores.
2. Cambiar el costo B y confirmar que cambian su valor neto, los minutos derivados y el costo total operativo de manera coherente.
3. Cambiar la tasa de abandono y comprobar que las cuatro curvas se actualizan.
4. Comprobar los cinco tamaños de Simpson y descargar la tabla CSV.
5. Probar en móvil el menú y las tablas desplazables.
