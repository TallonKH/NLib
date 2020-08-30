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
        minZoomFactor: 1,
        maxZoomFactor: 4,
        navigable: true,
        activeAreaBounded: true,
        zoomCenterMode: "pointer",
        fittingMode: "shrink",
        baseActiveDims: new NPoint(500, 500),
        activeAreaPadding: 0,
    });
    viewport._activeBackground.setColor(NColor.fromHex("#1a1a1a"));
    viewport.setup(document.getElementById("rootDiv"));
    // viewport.setZoomFactor(1);
}

function main() {
    const grabbables = [];
    // let height = -100;
    // const count = 100;
    // for(const space of ["RGB", "HSL", "Lab"]){
    //     const color1 = NColor.fromHex("#ff4747").convertTo(space);
    //     const color2 = NColor.fromHex("#4769ff").convertTo(space);
    //     for (let i = -count; i < count; i++) {
    //         const grabbable = new GrabObj(viewport, new NPoint(i*25*Math.cos(Math.abs(i) / 15), height + 400 * Math.sin(i/5)));
    //         grabbable.setColor(NColor.lerp(color1, color2, (i+count)/(count*2)));
    //         viewport.registerObj(grabbable);
    //     }
    //     height += 100;
    // }

    const color1 = NColor.fromHex("#ff4747");
    const color2 = NColor.fromHex("#4769ff");

    for(const corner of viewport._activeAreaCorners){
        const grabbable = new GrabObj(viewport, corner);
        grabbable.setColor(NColor.fromHex("#20B2AA"));
        viewport.registerObj(grabbable);
    }
}