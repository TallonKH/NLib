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

    intersects(point) {
        return true;
    }

    onDragStarted(pointerMoveEvent) {
        super.onDragStarted(pointerMoveEvent);
        if (this._vp.pannable) {
            this.suggestCursor("move");
        }
    }

    onDragged(pointerMoveEvent) {
        super.onDragged(pointerMoveEvent);
        if (this._vp.pannable) {
            this._vp.setPanCenter(this._vp._panCenter.addp(this._vp._pointerElemDelta), true);
        }
    }

    onDragEnded(pointerUpEvent) {
        super.onDragEnded(pointerUpEvent);
        if (this._vp.pannable) {
            this.unsuggestCursor("move");
        }
    }

    onWheel(wheelEvent){
        super.onWheel(wheelEvent);
        if(wheelEvent.ctrlKey){
            this._vp.offsetZoomCounter(-wheelEvent.deltaY);
        }else{
            if (this._vp.pannable) {
                this._vp.offsetPanCenter(wheelEvent.deltaX, wheelEvent.deltaY);
            }
        }
    }
}