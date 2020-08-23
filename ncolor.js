import * as nmath from nmath;
import * as rgblab from rgb2lab
import {compose, identity} from nmisc

function unimplemented(a) {
    console.error("Conversion not implemented yet!");
    return null;
}

const conversionMatrix = {
    "RGB": {
        "RGB": identity,
        "HSL": NColor.rgb_hsl,
        "Lab": NColor.rgb_lab,
    },
    "HSL": {
        "RGB": NColor.hsl_rgb,
        "HSL": identity,
        "Lab": compose(NColor.hsl_rgb, NColor.rgb_lab),
    },
    "Lab": {
        "RGB": NColor.lab_rgb,
        "HSL": compose(NColor.lab_rgb, NColor.rgb_hsl),
        "Lab": identity,
    }

}

/** Immutable */
export class NColor {
    constructor(model, v1, v2, v3, alpha = 1.0) {
        this.model = model;
        this.v1 = v1;
        this.v2 = v2;
        this.v3 = v3;
        this.alpha = alpha;
        Object.freeze(this);
    }

    toString() {
        return `(${model}: ${r}, ${g}, ${b}, ${b})`;
    }

    setV1(v1) {
        return new NColor(
            v1,
            this.v2,
            this.v3,
            this.alpha
        );
    }

    setV2(v2) {
        return new NColor(
            this.v1,
            v2,
            this.v3,
            this.alpha
        );
    }

    setV3(v3) {
        return new NColor(
            this.v1,
            this.v2,
            v3,
            this.alpha
        );
    }

    setAlpha(alpha) {
        return new NColor(
            this.v1,
            this.v2,
            this.v3,
            alpha
        );
    }

    modifyV1(func) {
        return new NColor(
            func(this.v1, this),
            this.v2,
            this.v3,
            this.alpha
        );
    }

    modifyV2(func) {
        return new NColor(
            this.v1,
            func(this.v2, this),
            this.v3,
            this.alpha
        );
    }

    modifyV3(func) {
        return new NColor(
            this.v1,
            this.v2,
            func(this.v3, this),
            this.alpha
        );
    }

    modifyAlpha(func) {
        return new NColor(
            this.v1,
            this.v2,
            this.v3,
            func(this.alpha, this)
        );
    }

    convertTo(model) {
        return conversionMatrix[this.model][model](this);
    }

    toHex() {
        const rgb = this.convertTo("RGB");
        return "#" +
            NColor.componentToHex(rgb.v1) +
            NColor.componentToHex(rgb.v2) +
            NColor.componentToHex(rgb.v3) +
            NColor.componentToHex(rgb.alpha);
    }

    static componentFromHex(hex) {
        return parseInt(hex, 16)/255;
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
                    "RGB",
                    NColor.componentFromHex(hex.substr(0, 2)),
                    NColor.componentFromHex(hex.substr(2, 2)),
                    NColor.componentFromHex(hex.substr(4, 2)),
                    NColor.componentFromHex(hex.substr(6, 2))
                );
            case 4: // RGBA shorthand
                return new NColor(
                    "RGB",
                    NColor.componentFromHex(hex[0] + hex[0]),
                    NColor.componentFromHex(hex[1] + hex[1]),
                    NColor.componentFromHex(hex[2] + hex[2]),
                    NColor.componentFromHex(hex[3] + hex[3])
                );
            case 6: // RGB
                return new NColor(
                    "RGB",
                    NColor.componentFromHex(hex.substr(0, 2)),
                    NColor.componentFromHex(hex.substr(2, 2)),
                    NColor.componentFromHex(hex.substr(4, 2)),
                    1.0
                );
            case 3: // RGB shorthand
                return new NColor(
                    "RGB",
                    NColor.componentFromHex(hex[0] + hex[0]),
                    NColor.componentFromHex(hex[1] + hex[1]),
                    NColor.componentFromHex(hex[2] + hex[2]),
                    1.0
                );
            default: // invalid length
                console.error(`fromHex received hex code ${hex} with invalid length!`)
                return null;
        }
    }

    static rgb_hsl(rgb) {
        const r = rgb.v1;
        const g = rgb.v1;
        const b = rgb.v1;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h;
        let s;
        let l = (max + min) / 2;
        if (max === min) {
            h = 0;
            s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }
        return new NColor("HSL", h, s, l, rgb.alpha);
    }

    static hsl_rgb(hsl) {
        const h = hsl.v1;
        const s = hsl.v2;
        const l = hsl.v3;
        const alpha = hsl.alpha;

        if (s === 0) {
            return new NColor("RGB", l, l, l, alpha);
        }

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;

        return new NColor(
            "RGB",
            hsl_rgb_helper(p, q, h + 1 / 3),
            hsl_rgb_helper(p, q, h),
            hsl_rgb_helper(p, q, h - 1 / 3),
            alpha
        );
    }

    static rgb_lab(rgb){
        const lab = rgblab.rgb2lab([rgb.v1, rgb.v2, rgb.v3]);
        return new NColor("Lab", ...lab, rgb.alpha);
    }

    static lab_rgb(lab){
        const rgb = rgblab.lab2rgb([lab.v1, lab.v2, lab.v3]);
        return new NColor("RGB", ...rgb, lab.alpha);
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

    /** perform an operator on the component values. Returns a new NColor. */
    operate(func, operateAlpha = false) {
        let alpha = 1.0;
        if (operateAlpha) {
            alpha = func(colorA.a, colorB.a, colorA, colorB);
        }

        return new NColor(
            this.model,
            func(this.v1, this),
            func(this.v2, this),
            func(this.v3, this),
            alpha
        );
    }

    /** Combine 2 NColors by running a binary operator on their RGB components. Yes, the name of this function is a pun. */
    static cooperate(colorA, colorB, func, operateAlpha = false) {
        if(colorA.model !== colorB.model){
            throw `Cannot combine colors with different models! [${colorA.model}] and [${colorB.model}].`
        }

        let alpha = 1.0;
        if (operateAlpha) {
            alpha = func(colorA.a, colorB.a, colorA, colorB);
        }

        return new NColor(
            colorA.model,
            func(colorA.r, colorB.r, colorA, colorB),
            func(colorA.g, colorB.g, colorA, colorB),
            func(colorA.b, colorB.b, colorA, colorB),
            alpha
        );
    }

    /** Combine n colors by running an array-taking operator on their RGB components. */
    static noperate(colors, func, operateAlpha = false) {
        if(colors.length == 0){
            throw "Cannot combine 0 colors!"
        }

        if(!allEqual(...colors.map(c => c.model))){
            throw "Cannot combine colors unless all have the same model!"
        }

        let alpha = 1.0;
        if (operateAlpha) {
            alpha = func(colors.map(c => c.a));
        }

        return new NColor(
            colors[0].model,
            func(colors.map(c => c.r)),
            func(colors.map(c => c.g)),
            func(colors.map(c => c.b)),
            alpha
        );
    }

    /** Average the components of an array of colors. */
    static average(colors, operateAlpha = false) {
        return NColor.noperate(
            colors,
            nmath.average,
            operateAlpha
        );
    }

    /** linearly interpolate two colors in their current space */
    static lerp(colorA, colorB, mix, operateAlpha) {
        return NColor.cooperate(
            colorA,
            colorB,
            ac, bc => nmath.lerp(ac, bc, mix),
            operateAlpha
        );
    }
}

function hsl_rgb_helper(p, q, t) {
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