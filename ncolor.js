import * as nmath from nmath;

/** Immutable. Stores RGBA values, each in the range [0.0, 1.0] */
export class NColor {
    constructor(r, g, b, a = 1.0) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        Object.freeze(this);
    }

    toString() {
        return `(${r}, ${g}, ${b}, ${b})`;
    }

    setRed(r) {
        return new NColor(
            r,
            this.g,
            this.b,
            this.a
        );
    }

    setGreen(g) {
        return new NColor(
            this.r,
            g,
            this.b,
            this.a
        );
    }

    setBlue(b) {
        return new NColor(
            this.r,
            this.g,
            b,
            this.a
        );
    }

    setAlpha(a) {
        return new NColor(
            this.r,
            this.g,
            this.b,
            a
        );
    }

    asRGB() {
        return {
            "r": Math.round(this.r * 255),
            "g": Math.round(this.g * 255),
            "b": Math.round(this.b * 255),
            "a": Math.round(this.a * 255)
        }
    }

    asHex() {
        return "#" +
            NColor.componentToHex(this.r) +
            NColor.componentToHex(this.g) +
            NColor.componentToHex(this.b) +
            NColor.componentToHex(this.a);
    }

    /** perform an operator on the RGB component values. Returns a new NColor. */
    operate(func) {
        return new NColor(
            func(r, this),
            func(g, this),
            func(b, this)
        );
    }

    /** Creates an NColor from RGB values [0, 255] */
    static fromRGB(r, g, b, a = 1.0) {
        return new NColor(
            componentFromInt(r),
            componentFromInt(g),
            componentFromInt(b),
            componentFromInt(a)
        );
    }

    /** Creates an NColor from a CSS-style hex code */
    static fromHex(hex) {
        // strip leading #, if it is present
        if (hex[0] == "#") {
            hex = hex.substring(1);
        };

        // convert based on length
        switch (hex.length) {
            case 8: // RGBA
                return new NColor(
                    componentFromHex(hex.substr(0, 2)),
                    componentFromHex(hex.substr(2, 2)),
                    componentFromHex(hex.substr(4, 2)),
                    componentFromHex(hex.substr(6, 2))
                );
            case 4: // RGBA shorthand
                return new NColor(
                    componentFromHex(hex[0] + hex[0]),
                    componentFromHex(hex[1] + hex[1]),
                    componentFromHex(hex[2] + hex[2]),
                    componentFromHex(hex[3] + hex[3])
                );
            case 6: // RGB
                return new NColor(
                    componentFromHex(hex.substr(0, 2)),
                    componentFromHex(hex.substr(2, 2)),
                    componentFromHex(hex.substr(4, 2))
                );
            case 3: // RGB shorthand
                return new NColor(
                    componentFromHex(hex[0] + hex[0]),
                    componentFromHex(hex[1] + hex[1]),
                    componentFromHex(hex[2] + hex[2])
                );
            default: // invalid length
                console.error(`fromHex received hex code ${hex} with invalid length!`)
                return null;
        }
    }

    static fromHSL(h, s, l, a = 1.0) {
        if (s === 0) {
            return new NColor(l, l, l, a);
        }

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        return new NColor(
            hueToRGB(p, q, h + 1 / 3),
            hueToRGB(p, q, h),
            hueToRGB(p, q, h - 1 / 3),
            a
        );
    }

    static hueToRGB(p, q, t) {
        if (t < 0) {
            t += 1;
        }
        if (t > 1) {
            t -= 1;
        }
        if (t < 1 / 6) {
            return p + (q - p) * 6 * t;
        }
        if (t < 1 / 2) {
            return q;
        }
        if (t < 2 / 3) {
            return p + (q - p) * (2 / 3 - t) * 6;
        }
        return p;
    }

    static componentFromHex(hex) {
        return NColor.componentFromInt(parseInt(hex, 16));
    }

    static componentFromInt(i) {
        return i / 255.0;
    }

    static componentToInt(c) {
        return Math.round(c * 255);
    }

    static componentToHex(c) {
        // hex
        const hex = NColor.componentToInt(c).toString(16);

        // leading 0
        return hex.length === 1 ? "0" + hex : hex;
    }

    /** Combine 2 NColors by running a binary operator on their RGB components. Yes, the name of this function is a pun. */
    static cooperate(colorA, colorB, func, operateAlpha = false) {
        let alpha = 1.0;
        if (operateAlpha) {
            alpha = func(colorA.a, colorB.a, colorA, colorB);
        }

        return new NColor(
            func(colorA.r, colorB.r, colorA, colorB),
            func(colorA.g, colorB.g, colorA, colorB),
            func(colorA.b, colorB.b, colorA, colorB),
            alpha
        );
    }

    /** Combine n colors by running an array-taking operator on their RGB components. */
    static noperate(colors, func, operateAlpha = false) {
        let alpha = 1.0;
        if (operateAlpha) {
            alpha = func(colors.map(c => c.a));
        }

        return new NColor(
            func(colors.map(c => c.r)),
            func(colors.map(c => c.g)),
            func(colors.map(c => c.b)),
            alpha
        );
    }

    /** Average the RGB components of an array of colors. */
    static average(colors, operateAlpha = false) {
        return noperate(
            colors,
            nmath.average,
            operateAlpha
        );
    }

    /** linearly interpolate two colors in RGB space */
    static lerp(colorA, colorB, mix, operateAlpha) {
        return NColor.cooperate(
            colorA,
            colorB,
            ac, bc => nmath.lerp(ac, bc, mix),
            operateAlpha
        );
    }

    /** generate a color with random RGB values */
    static random() {
        return new NColor(
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255),
            Math.floor(Math.random() * 255)
        );
    }
}

// hexToHSL = function (hex) {
//     var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
//     r = parseInt(result[1], 16);
//     g = parseInt(result[2], 16);
//     b = parseInt(result[3], 16);
//     r /= 255, g /= 255, b /= 255;
//     var max = Math.max(r, g, b),
//         min = Math.min(r, g, b);
//     var h, s, l = (max + min) / 2;
//     if (max === min) {
//         h = s = 0; // achromatic
//     } else {
//         var d = max - min;
//         s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
//         switch (max) {
//             case r:
//                 h = (g - b) / d + (g < b ? 6 : 0);
//                 break;
//             case g:
//                 h = (b - r) / d + 2;
//                 break;
//             case b:
//                 h = (r - g) / d + 4;
//                 break;
//         }
//         h /= 6;
//     }
//     return [h, s, l];
// }

// hslLerp = function (a, b, alpha) {
//     const [ha, sa, la] = hexToHSL(a);
//     const [hb, sb, lb] = hexToHSL(b);
//     return hslToHex(
//         lerp(ha, hb, alpha),
//         lerp(sa, sb, alpha),
//         lerp(la, lb, alpha)
//     );
// }