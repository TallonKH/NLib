import VPObject from "./vp_object.js";
import NColor from "../ncolor.js";

export default class VPBackground extends VPObject {
    constructor(viewport, {} = {}) {
        super(viewport, {
            "mouseListening": true,
            "zOrder": -65536
        })
        this.colorHex = "#1a1a1a"
        this.color = NColor.fromHex(this.colorHex);
    }

    setColor(color) {
        this.color = color;
        this.colorHex = color.toHex();
        this._vp.queueRedraw();
    }

    draw(ctx) {
        ctx.fillStyle = this.colorHex;
        // let dims = this._vp._activeAreaDims;
        // if(dims === "INFINITE"){
        let currentTransform = ctx.getTransform();
        ctx.resetTransform();
        const cvs = this._vp._canvas;
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        ctx.setTransform(currentTransform);
        // }else{
        //     dims = dims.divide1(this._vp._minZoomFactor);
        //     ctx.fillRect(-dims.x, -dims.y, dims.x * 2, dims.y * 2);
        // }
    }

    intersects(point) {
        return true;
    }

    onClicked(mouseClickEvent) {
        super.onClicked(mouseClickEvent);
        this._vp.recenter();
    }

    onDragStarted(pointerMoveEvent) {
        super.onDragStarted(pointerMoveEvent);
        if (this._vp.navigable) {
            this.suggestCursor("move");
        }
    }

    onDragged(pointerMoveEvent) {
        super.onDragged(pointerMoveEvent);
        if (this._vp.navigable) {
            this._vp.setPanCenter(this._vp._panCenter.addp(this._vp._pointerElemDelta), true);
        }
    }

    onDragEnded(pointerUpEvent) {
        super.onDragEnded(pointerUpEvent);
        if (this._vp.navigable) {
            this.unsuggestCursor("move");
        }
    }

    onWheel(wheelEvent) {
        super.onWheel(wheelEvent);
        if (wheelEvent.ctrlKey) {
            this._vp.scrollZoomCounter(-wheelEvent.deltaY);
        } else {
            if (this._vp.navigable) {
                this._vp.scrollPanCenter(wheelEvent.deltaX, wheelEvent.deltaY);
            }
        }
    }
}