export namespace collisions {
	interface Circle {
		x: number;
		y: number;
		r: number;
	}

	interface Rect {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	export function RectCircle(rect: Rect, circle: Circle){
		const distX = Math.abs(circle.x - rect.x);
		const distY = Math.abs(circle.y - rect.y);

		if (distX > rect.w / 2 + circle.r) return false;
		if (distY > rect.h / 2 + circle.r) return false;

		if (distX <= rect.w / 2) return true;
		if (distY <= rect.h / 2) return true;

		const dx = distX - rect.w / 2;
		const dy = distY - rect.h / 2;

		return dx * dx + dy * dy <= circle.r * circle.r;

	}

}