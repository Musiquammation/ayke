// chartManager.ts
import { TimeSeriesData } from './types';
// Note: In browser environment, Chart is available globally via window.Chart

export class ChartManager {
    private serverChart: any = null;
    private usersChart: any = null;
    private gamesChart: any = null;

    public renderCharts(data: TimeSeriesData) {
        this.renderServerStatus(data.serverStatus);
        this.renderUsersChart(data.connectedUsersTotal, data.connectedUsersFiltered);
        this.renderGamesChart(data.activeGamesTotal, data.activeGamesFiltered);
    }

    private commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'minute', // Selectionable à la minute près par zoom/pan (requires chartjs-plugin-zoom for full interactivity)
                    displayFormats: {
                        minute: 'HH:mm'
                    }
                },
                title: { display: true, text: 'Time' }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    afterBody: (context: any) => {
                        // Custom tooltip to show extra info on hover
                        const dataPoint = context[0].dataset.data[context[0].dataIndex];
                        return dataPoint.info ? `\nDetails: ${dataPoint.info}` : '';
                    }
                }
            }
        }
    };

    private renderServerStatus(data: any[]) {
        const ctx = (document.getElementById('serverStatusChart') as HTMLCanvasElement).getContext('2d');
        if (this.serverChart) this.serverChart.destroy();

        this.serverChart = new (window as any).Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Server Status (1=On, 0=Off)',
                    data: data,
                    borderColor: '#2ecc71',
                    stepped: true, // Perfect for boolean states
                    fill: true,
                    backgroundColor: 'rgba(46, 204, 113, 0.2)'
                }]
            },
            options: {
                ...this.commonOptions,
                scales: {
                    ...this.commonOptions.scales,
                    y: { min: 0, max: 1.2, ticks: { stepSize: 1 } }
                }
            }
        });
    }

    private renderUsersChart(total: any[], filtered: any[]) {
        const ctx = (document.getElementById('usersChart') as HTMLCanvasElement).getContext('2d');
        if (this.usersChart) this.usersChart.destroy();

        this.usersChart = new (window as any).Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Total Users',
                        data: total,
                        borderColor: '#3498db',
                        stepped: true
                    },
                    {
                        label: 'Filtered Users',
                        data: filtered,
                        borderColor: '#e74c3c',
                        borderDash: [5, 5],
                        stepped: true
                    }
                ]
            },
            options: this.commonOptions
        });
    }

    private renderGamesChart(total: any[], filtered: any[]) {
        const ctx = (document.getElementById('gamesChart') as HTMLCanvasElement).getContext('2d');
        if (this.gamesChart) this.gamesChart.destroy();

        this.gamesChart = new (window as any).Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Total Games',
                        data: total,
                        borderColor: '#9b59b6',
                        stepped: true
                    },
                    {
                        label: 'Filtered Games',
                        data: filtered,
                        borderColor: '#f1c40f',
                        borderDash: [5, 5],
                        stepped: true
                    }
                ]
            },
            options: this.commonOptions
        });
    }
}
