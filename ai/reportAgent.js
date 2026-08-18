async function generateReport(reportData) {

    const prompt = window.createPrompt(reportData);

    const report = await window.askAI(prompt);

    return report;
}

window.generateReport = generateReport;