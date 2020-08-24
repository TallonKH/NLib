import VPObject from "./vp_object.js";

export default class VPBackground extends VPObject {
    constructor(viewport, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "zOrder": -65536
        })
        this.color = "#ebebeb";
    }

    draw(ctx) {
        let currentTransform = ctx.getTransform();
        ctx.resetTransform();
        ctx.fillStyle = this.color;
        ctx.fillRect(0, 0, this._vp.canvas.width, this._vp.canvas.height);
        ctx.setTransform(currentTransform);
    }

    isOverlapping(point) {
        return true;
    }

    isMouseBlockingOverlap() {
        return true;
    }

    isMouseBlockingPress() {
        return true;
    }

    onDragStarted() {
        super.onDragStarted();
        if (this._vp.pannable) {
            this.suggestCursor("move");
        }
    }

    onDragged() {
        super.onDragged();
        if (this._vp.pannable) {
            this._vp.setPanCenter(this._vp._panCenter.addp(this._vp._mouseElemDelta), true);
        }
    }

    onDragEnded() {
        super.onDragEnded();
        if (this._vp.pannable) {
            this.unsuggestCursor("move");
        }
    }
}