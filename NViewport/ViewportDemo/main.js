import NPoint from "../../npoint.js";
import NColor from "../../ncolor.js"
import GrabObj from "./grabbable.js";
import NViewport from "../nviewport.js";

var viewport;

window.onload = function () {
    setupElements();
    main();
};

function setupElements() {
    viewport = new NViewport({
        "minZoomFactor": 0.25,
        "maxZoomFactor": 4,
        "pannable": true,
        "zoomSensitivity": 1,
        "panSensitivity": 0.5,
        "zoomCenter": "mouse"
    });
    viewport.background.color = "#1a1a1a"
    viewport.setup(document.getElementById("rootDiv"));
}

function main() {
    const grabbables = [];
    const color1 = NColor.fromHex("#ff4747").convertTo("Lab");
    const color2 = NColor.fromHex("#4769ff").convertTo("Lab");
    color1.log();
    color2.log();
    for (let i = -15; i < 15; i++) {
        const grabbable = new GrabObj(viewport, new NPoint(i*25*Math.cos(Math.abs(i) / 25), 0*Math.sin(i/10)));
        grabbable.color = NColor.lerp(color1, color2, (i+15)/30);
        grabbable.color.log();
        viewport.registerObj(grabbable);
    }
}