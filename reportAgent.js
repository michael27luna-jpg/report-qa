import { askAI } from "./ai/openrouter.js";
import { createPrompt } from "./prompts.js";

async function generateReport(data) {
    const prompt = createPrompt(data);

    const report = await askAI(prompt);

    return report;
}

// La hacemos accesible desde otros archivos
window.generateReport = generateReport;