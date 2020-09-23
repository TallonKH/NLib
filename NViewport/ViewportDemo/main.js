import NPoint from "../../npoint.js";
import NColor from "../../ncolor.js"
import {lerp} from "../../nmath.js"
import GrabObj from "./grabbable.js";
import VisibleAreaMarker from "./visible-area-marker.js";
import NViewport from "../nviewport.js";

var viewport;

window.onload = function () {
    setupElements();
    main();
};

function setupElements() {
    const rootDiv = document.getElementById("rootDiv");
    viewport = new NViewport({
        minZoomFactor: 1,
        maxZoomFactor: 8,
        navigable: true,
        activeAreaBounded: true,
        zoomCenterMode: "pointer",
        fittingBasis: "element",
        fittingMode: "shrink",
        baseActiveDims: new NPoint(6000, 3750),
        activeAreaPadding: new NPoint(0),
    });
    viewport.setup(rootDiv);
    viewport._activeBackground.setColor(NColor.fromHex("#1a1a1a"));
    rootDiv.style.backgroundColor = "#101010";
}

function main() {
    const grabbables = [];
    let height = -100;
    const count = 4;
    // const spaces = ["RGB", "HSL", "Lab"];
    const spaces = ["RGB"];
    for(const space of spaces){
        const color1 = NColor.fromHex("#ff4747").convertTo(space);
        const color2 = NColor.fromHex("#4769ff").convertTo(space);
        for (let i = -count; i < count; i++) {
            // const grabbable = new GrabObj(viewport, new NPoint(i*25*Math.cos(Math.abs(i) / 15), height + 400 * Math.sin(i/5)));
            const grabbable = new GrabObj(viewport, new NPoint(i * 25, 100));
            grabbable.setColor(NColor.lerp(color1, color2, (i+count)/(count*2)));
            // grabbable.setSize(lerp(25,10,Math.abs(i)/count));
            viewport.registerObj(grabbable);
        }
        height += 100;
    }

    const color1 = NColor.fromHex("#ff4747");
    const color2 = NColor.fromHex("#4769ff");

    for (const corner of viewport._activeAreaCorners) {
        const grabbable = new GrabObj(viewport, corner);
        grabbable.setColor(NColor.fromHex("#20B2AA"));
        grabbable.setSize(100);
        viewport.registerObj(grabbable);
    }

    viewport.registerObj(new VisibleAreaMarker(viewport));
}