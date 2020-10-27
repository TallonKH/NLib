import VPObject from "./vp-object.js";
import NColor from "../ncolor.js";

export default class VPBackground extends VPObject {
  constructor(viewport, {} = {}) {
    super(viewport, {
      mouseListening: true,
      zOrder: -65536
    });
    this.colorHex = "#1a1a1a";
    this.color = NColor.fromHex(this.colorHex);

    this.draggable = true;
  }

  setColor(color) {
    this.color = color;
    this.colorHex = color.toHex();
    this.requestRedraw();
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
      const cvs = ctx.canvas;
      ctx.fillRect(0, 0, cvs.width, cvs.height);
      ctx.setTransform(currentTransform);
    }
  }

  intersects(point, isInBounds) {
    return true;
  }

  onClicked(mouseClickEvent) {
    super.onClicked(mouseClickEvent);
    // this._vp.setZoomFactor(1, NPoint.ZERO);
    // this._vp.recenter();
  }

  onDragStarted(pointerMoveEvent) {
    super.onDragStarted(pointerMoveEvent);
    if (this.draggable) {
      if (this._vp._navigable) {
        this.suggestCursor("move");
      }
    }
  }

  onDragged(pointerMoveEvent) {
    super.onDragged(pointerMoveEvent);
    if (this.draggable) {
      if (this._vp._navigable) {
        this._vp.setPanCenter(this._vp._panCenter.addp(this._vp._pointerElemDelta), true);
      }
    }
  }

  onDragEnded(pointerUpEvent) {
    super.onDragEnded(pointerUpEvent);
    if (this.draggable) {
      this.unsuggestCursor("move");
    }
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

  // allow events to reach global channel unhindered
  blockClickEvent(mouseClickEvent) {
    return false;
  }

  // allow events to reach global channel unhindered
  blockOverlapEvent(pointerMoveEvent) {
    return false;
  }
}
