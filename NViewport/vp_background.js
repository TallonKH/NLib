import VPObject from "./vp_object.js";
import NColor from "../ncolor.js";
import NPoint from "../npoint.js";

export default class VPBackground extends VPObject {
    constructor(viewport, {} = {}) {
        super(viewport, {
            mouseListening: true,
            zOrder: -65536
        });
        this.colorHex = "#1a1a1a";
        this.color = NColor.fromHex(this.colorHex);
    }

    setColor(color) {
        this.color = color;
        this.colorHex = color.toHex();
        this._vp.queueRedraw();
    }

    draw(ctx) {
        ctx.fillStyle = this.colorHex;
        if (this._vp._activeAreaBounded) {
            const corner = this._vp._activeAreaCorners[0];
            const dims = this._vp._baseActiveAreaDims;
            ctx.fillRect(-corner.x, -corner.y, dims.x, dims.y);
        } else {
            let currentTransform = ctx.getTransform();
            ctx.resetTransform();
            const cvs = this._vp._canvas;
            ctx.fillRect(0, 0, cvs.width, cvs.height);
            ctx.setTransform(currentTransform);
        }
    }

    intersects(point, isInBounds) {
        return true;
    }

    onClicked(mouseClickEvent) {
        super.onClicked(mouseClickEvent);
        this._vp.setZoomFactor(1, NPoint.ZERO);
        this._vp.recenter();
    }

    onDragStarted(pointerMoveEvent) {
        super.onDragStarted(pointerMoveEvent);
        if (this._vp._navigable) {
            this.suggestCursor("move");
        }
    }

    onDragged(pointerMoveEvent) {
        super.onDragged(pointerMoveEvent);
        if (this._vp._navigable) {
            this._vp.setPanCenter(this._vp._panCenter.addp(this._vp._pointerElemDelta), true);
        }
    }

    onDragEnded(pointerUpEvent) {
        super.onDragEnded(pointerUpEvent);
        this.unsuggestCursor("move");
    }

    onWheel(wheelEvent) {
        super.onWheel(wheelEvent);
        if (this._vp._navigable) {
            if (wheelEvent.ctrlKey) {
                this._vp.scrollZoomCounter(-wheelEvent.deltaY);
            } else {
                this._vp.scrollPanCenter(wheelEvent.deltaX, wheelEvent.deltaY);
            }
        }
    }
}