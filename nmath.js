export function floorMod(a, b) {
	return ((a % b) + b) % b;
}

export function clamp(a, min = 0.0, max = 1.0) {
	return Math.min(Math.max(min, a), max);
}

/** clamps a between -b and b */
export function absMin(a, b) {
	return clamp(a, -b, b);
}

/** linear interpolate from min to max */
export function lerp(min, max, alpha) {
	return max * alpha + min * (1 - alpha);
}

export function average(values) {
	return values.reduce(a, b => a + b, 0) / values.length;
}

export function gaussianGenerator(mean, stdev) {
	var y2;
	var use_last = false;
	return function () {
		var y1;
		if (use_last) {
			y1 = y2;
			use_last = false;
		} else {
			var x1, x2, w;
			do {
				x1 = 2.0 * Math.random() - 1.0;
				x2 = 2.0 * Math.random() - 1.0;
				w = x1 * x1 + x2 * x2;
			} while (w >= 1.0);
			w = Math.sqrt((-2.0 * Math.log(w)) / w);
			y1 = x1 * w;
			y2 = x2 * w;
			use_last = true;
		}

		var retval = mean + stdev * y1;
		if (retval > 0)
			return retval;
		return -retval;
	}
}