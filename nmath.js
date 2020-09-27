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

/** linear interpolate from a to b */
export function lerp(a, b, factor) {
	return b * factor + a * (1 - factor);
}

export function step(edge, value) {
	return value < edge ? 0 : 1;
}

export function smoothStep(minEdge, maxEdge, value, easingFunc = hermite) {
	return easingFunc(clamp(value, minEdge, maxEdge) / (maxEdge - minEdge));
}


export const easingFuncs = {
	linear: easeLinear,
	hermite: easeHermite,
	quadratic: easeQuadratic,
	cubic: easeCubic,
	sine: easeSine
};

export function ease(x, methodName) {
	return easingFuncs[methodName](x);
}

export function easeLinear(x) {
	return x;
}

export function easeHermite(x) {
	return x * x * (3 - 2 * x);
}

export function easeQuadratic(x) {
	return x < 0.5 ? (2 * x * x) : (1 - pow(-2 * x + 2, 2) * 0.5);
}

export function easeCubic(x) {
	return x < 0.5 ? (4 * x * x * x) : (1 - pow(-2 * x + 2, 3) * 0.5);
}

export function easeSine(x) {
	return -(cos(PI * x) - 1) / 2;
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

const degRadConst = Math.PI / 180;
export function toRads(degs){
	return degs * degRadConst;
}

const radDegConst = 180 / Math.PI;
export function toDegrees(rads){
	return rads * radDegConst;
}