export function identity(a) {
    return a;
}

export function compose(...funcs){
    let existing = funcs[0]
    for(let i=1, l=funcs.length; i<l; i++){
        const current = funcs[i];
        existing = val => current(existing(val));
    }
    return existing;
}

export function getRand(array) {
	return array[Math.floor(Math.random() * array.length)];
}

export function allEqual(...ls) {
	if (ls.length === 0) {
		return true;
	}
	const a = ls[0];
	for (const b of ls) {
		if (a !== b) {
			return false;
		}
	}
	return true;
}


export function popRand(array) {
	const i = Math.floor(Math.random() * array.length);
	const result = array[i];
	array.splice(i, 1);
	return result;
}

export function getDivPosition(div) {
	const rect = div.getBoundingClientRect();
	return {
		"x": rect.left,
		"y": rect.top
	};
}

export function getDivCenter(div) {
	const rect = div.getBoundingClientRect();
	return {
		"x": (rect.left + rect.right) / 2,
		"y": (rect.top + rect.bottom) / 2
	};
}

export function shallowStringify(obj, maxDepth, depth = 0) {
	const type = typeof obj;
	switch (type) {
		case "string":
			return obj;
		case "number":
			return obj.toString();
		default:
			if (depth < maxDepth) {
				return "{" +
					Object.keys(obj).map(
						key => (
							shallowStringify(key, maxDepth, depth + 1) + ":" + shallowStringify(obj[key], maxDepth, depth + 1)
						)
					).join(", ") + "}";
			} else {
				return type;
			}
	}
}

export function saveCanvas(canvas, name) {
	const link = document.createElement("a");
	link.setAttribute("download", name + ".png");
	link.setAttribute("href", canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));
	link.click();
}

export function currentTimeMillis() {
	return (new Date()).getTime();
}

export function downloadFile(filename, text) {
	const link = document.createElement("a");
	link.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
	link.setAttribute("download", filename);

	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
}

// by stackoverflow user 4815056
export function getOS() {
	const userAgent = window.navigator.userAgent;
	const platform = window.navigator.platform;
	const macosPlatforms = ["Macintosh", "MacIntel", "MacPPC", "Mac68K"];
	const windowsPlatforms = ["Win32", "Win64", "Windows", "WinCE"];
	const iosPlatforms = ["iPhone", "iPad", "iPod"];

	if (macosPlatforms.indexOf(platform) !== -1) {
		return "Mac";
	}
	if (iosPlatforms.indexOf(platform) !== -1) {
		return "iOS";
	}
	if (windowsPlatforms.indexOf(platform) !== -1) {
		return "Windows";
	}
	if (/Android/.test(userAgent)) {
		return "Android";
	}
	if (!os && /Linux/.test(platform)) {
		return "Linux";
	}
}

function clearObj(obj) {
	for (const key in obj) {
		delete obj[key];
	}
}