export async function sleepTime(delay: number): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, delay));
}
