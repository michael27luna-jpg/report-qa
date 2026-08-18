function createPrompt(reportData) {

    return `
Eres un Senior QA Lead con experiencia en Quality Assurance y elaboración de reportes ejecutivos.

Analiza la siguiente información correspondiente al resumen semanal de QA:

Semana:
${reportData.week}

Datos:

${JSON.stringify(reportData, null, 2)}

Genera un informe profesional en formato HTML.

El informe debe contener:

<h2>📊 Executive Summary</h2>

- Resumen general del desempeño del equipo.
- Estado general de la calidad.

<h2>📈 Key Metrics</h2>

- Total de casos.
- Pass Rate.
- Failed.
- Critical.
- Opportunity.

<h2>🔍 Main Findings</h2>

Describe los hallazgos más importantes encontrados durante la semana.

<h2>⚠ Risks</h2>

Explica los riesgos detectados y qué impacto podrían tener.

<h2>💡 Recommendations</h2>

Propón recomendaciones priorizadas para mejorar la calidad.

<h2>🏁 Conclusion</h2>

Escribe una conclusión ejecutiva de no más de un párrafo.

Reglas:

- Usa lenguaje profesional.
- No inventes información.
- Basa todas las conclusiones únicamente en los datos recibidos.
- Devuelve únicamente HTML válido.
`;
}

window.createPrompt = createPrompt;