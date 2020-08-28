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
        minZoomFactor: 0.25,
        maxZoomFactor: 4,
        navigable: true,
        zoomSensitivity: 1,
        panSensitivity: 0.5,
        zoomCenterMode: "pointer",
        activeAreaDims: new NPoint(500, 300)
    });
    viewport._background.setColor(NColor.fromHex("#1a1a1a"));
    viewport.setup(document.getElementById("rootDiv"));
    viewport.setZoomFactor(0.25);
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

    let grabbable = new GrabObj(viewport, new NPoint(-250, -150));
    grabbable.setColor(NColor.lerp(color1, color2, 0));
    viewport.registerObj(grabbable);
}