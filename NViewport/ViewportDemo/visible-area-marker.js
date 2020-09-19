import VPObject from "../vp-object.js";
import NColor from "../../ncolor.js";
import NPoint from "../../npoint.js";

export default class VisibleAreaMarker extends VPObject {
    constructor(viewport, position, {} = {}) {
        super(viewport, {
            mouseListening: false,
            position: position,
            zOrder: 10,
        });
        this.setSize(25);
        this.colorHex = "#f08070";
        this.color = NColor.fromHex(this.colorHex);
    }

    setColor(color) {
        this.color = color;
        this.colorHex = color.toHex();
        this._vp.queueRedraw();
    }

    draw(ctx) {
        ctx.strokeStyle = this.colorHex;
        ctx.lineWidth = 4;
        let pos;

        pos = this._vp._visibleAreaMinCorner;
        ctx.beginPath();
        ctx.ellipse(
            pos.x, pos.y,
            this._size, this._size,
            0,
            0, 2 * Math.PI);
        ctx.stroke();

        pos = this._vp._visibleAreaMaxCorner;
        ctx.beginPath();
        ctx.ellipse(
            pos.x, pos.y,
            this._size, this._size,
            0,
            0, 2 * Math.PI);
        ctx.stroke();
    }
}