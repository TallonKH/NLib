var rootDiv;
var viewport;

window.onload = function () {
    setupElements();
    main();
};

function setupElements() {
    rootDiv = document.getElementById("rootDiv");
    viewport = new Viewport({
        "minZoomFactor": 0.25,
        "maxZoomFactor": 4,
        "pannable": true,
        "zoomSensitivity": 1,
        "panSensitivity": 0.5,
        "zoomCenter": "mouse"
    });
    viewport.background.color = "#1a1a1a"
    rootDiv.appendChild(viewport.container);
}

function main() {
    const grabbables = [];
    for (let i = -15; i < 15; i++) {
        const grabbable = new GrabObj(viewport, new NPoint(i*25*Math.cos(Math.abs(i) / 25), 0*Math.sin(i/10)));
        grabbable.color = lerpColors("#ff4747", "#4769ff", (i+15)/30);
        viewport.registerObj(grabbable);
    }
}