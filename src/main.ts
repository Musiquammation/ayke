// main.ts
import { LogParser } from './parser';
import { ChartManager } from './chartManager';

document.addEventListener('DOMContentLoaded', () => {
	const parseBtn = document.getElementById('parseBtn') as HTMLButtonElement;
	const logInput = document.getElementById('logInput') as HTMLTextAreaElement;
	const userRegexInput = document.getElementById('userRegex') as HTMLInputElement;
	const gameRegexInput = document.getElementById('gameRegex') as HTMLInputElement;
	const chartsSection = document.getElementById('chartsSection') as HTMLElement;

	const parser = new LogParser();
	const chartManager = new ChartManager();

	parseBtn.addEventListener('click', () => {
		const rawLogs = logInput.value;
		if (!rawLogs.trim()) {
			alert('Please paste some logs first.');
			return;
		}

		const userRegex = userRegexInput.value;
		const gameRegex = gameRegexInput.value;

		// Parse logs
		const parsedData = parser.parseLogs(rawLogs, userRegex, gameRegex);

		// Show charts section
		chartsSection.style.display = 'block';

		// Render charts
		chartManager.renderCharts(parsedData);
	});
});
