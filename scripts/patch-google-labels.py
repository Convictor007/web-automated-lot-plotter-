from pathlib import Path

p = Path(r"c:\xampp\htdocs\automated-lot-plotter\src\features\lot-plotter\map\GoogleMapView.tsx")
text = p.read_text(encoding="utf-8")

start = text.index("    function addLabel(text, lat, lng, angleDeg, color) {")
end = text.index("  };", start) + 4  # end of lotPlotterApplyLotUi

new_block = r"""    var labelColor = opts.labelColor || '#ffffff';
    var centroid = calcCentroid(coords);
    function edgeAngleDeg(p1, p2) {
      var dx = p2[0]-p1[0], dy = p2[1]-p1[1];
      var angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
      return angleDeg;
    }
    function outwardOffsetPx(p1, p2) {
      var midLat = (p1[1]+p2[1])/2, midLng = (p1[0]+p2[0])/2;
      var dx = p2[0]-p1[0], dy = p2[1]-p1[1];
      var len = Math.sqrt(dx*dx+dy*dy) || 1;
      var nx = -dy/len, ny = dx/len;
      var vx = midLng - centroid.lng, vy = midLat - centroid.lat;
      return (vx*nx + vy*ny) >= 0 ? 16 : -16;
    }
    function addAlongLineLabel(html, lat, lng, angleDeg, offsetPx) {
      function Ov(pos, innerHtml, ang, off, col) {
        this.pos = pos; this.innerHtml = innerHtml; this.ang = ang; this.off = off; this.col = col; this.div = null;
      }
      Ov.prototype = new g.OverlayView();
      Ov.prototype.onAdd = function() {
        this.div = document.createElement('motion');
        this.div.style.cssText = 'position:absolute;white-space:nowrap;text-align:center;line-height:1.25;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(0,0,0,.62);color:'+this.col+';pointer-events:none';
        this.div.innerHTML = this.innerHtml;
        this.getPanes().overlayMouseTarget.appendChild(this.div);
      };
      Ov.prototype.draw = function() {
        if (!this.div) return;
        var px = this.getProjection().fromLatLngToDivPixel(this.pos);
        if (!px) return;
        this.div.style.left = px.x + 'px';
        this.div.style.top = px.y + 'px';
        this.div.style.transform = 'translate(-50%,-50%) rotate('+this.ang+'deg) translate(0,'+this.off+'px)';
      };
      Ov.prototype.onRemove = function() { if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div); };
      var ov = new Ov(new g.LatLng(lat, lng), html, angleDeg, offsetPx, labelColor);
      ov.setMap(map);
      window.lotPlotterLabelOverlays.push(ov);
    }
    function addCenterLabel(html, lat, lng) {
      function Cv(pos, innerHtml) { this.pos = pos; this.innerHtml = innerHtml; this.div = null; }
      Cv.prototype = new g.OverlayView();
      Cv.prototype.onAdd = function() {
        this.div = document.createElement('motion');
        this.div.style.cssText = 'position:absolute;pointer-events:none';
        this.div.innerHTML = this.innerHtml;
        this.getPanes().overlayMouseTarget.appendChild(this.div);
      };
      Cv.prototype.draw = function() {
        if (!this.div) return;
        var px = this.getProjection().fromLatLngToDivPixel(this.pos);
        if (!px) return;
        this.div.style.left = px.x + 'px';
        this.div.style.top = px.y + 'px';
        this.div.style.transform = 'translate(-50%,-50%)';
      };
      Cv.prototype.onRemove = function() { if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div); };
      var ov = new Cv(new g.LatLng(lat, lng), html);
      ov.setMap(map);
      window.lotPlotterLabelOverlays.push(ov);
    }
    if (opts.showDistance) {
      var segmentEdges = Array.isArray(opts.segmentEdges) ? opts.segmentEdges : [];
      for (var i = 0; i < coords.length - 1; i++) {
        var p1 = coords[i], p2 = coords[i+1];
        var dist = calcDist(p1[1], p1[0], p2[1], p2[0]);
        var midLat = (p1[1]+p2[1])/2, midLng = (p1[0]+p2[0])/2;
        var ang = edgeAngleDeg(p1, p2);
        var off = outwardOffsetPx(p1, p2);
        var edge = segmentEdges[i];
        var bearingLine = edge && edge.bearing ? edge.bearing : toLotPlanBearingLabel(p1, p2);
        var distLine = edge && edge.distanceM != null ? (Number(edge.distanceM).toFixed(2)+' m.') : (dist.toFixed(2)+' m.');
        addAlongLineLabel(bearingLine + '<br>' + distLine, midLat, midLng, ang, off);
      }
    }
    if (opts.showArea) {
      if (opts.centerLabelHtml) {
        addCenterLabel(opts.centerLabelHtml, centroid.lat, centroid.lng);
      } else {
        var displayArea = opts.area != null ? opts.area : calcArea(coords);
        addCenterLabel('<motion style="text-align:center;color:'+labelColor+';font-weight:700;font-size:12px;padding:4px 6px;background:rgba(0,0,0,0.55);border-radius:4px">A='+displayArea.toFixed(3)+' Sq.m.</motion>', centroid.lat, centroid.lng);
      }
    }
"""

new_block = new_block.replace("createElement('motion')", "createElement('div')").replace("</motion>", "</div>").replace("<motion ", "<div ")

text = text[:start] + new_block + text[end:]

text = text.replace(
    """  const lotUiPayload = useMemo(
    () => ({
      strokeColor: polygon?.color || '#8e1616',
      fillColor: polygon?.fillColor || '#8e1616',
      labelColor: '#ffffff',
      segmentLabels: polygon?.segmentLabels || [],
      showArea: showAreaLabel,
      showDistance: showDistanceLabel,
      area: area !== undefined && area !== null ? area : null,
    }),
    [polygon?.color, polygon?.fillColor, polygon?.segmentLabels, showAreaLabel, showDistanceLabel, area]
  )""",
    """  const centerLabelHtml = useMemo(() => {
    if (!polygon?.centerLabel) return ''
    return buildCenterLabelHtml(polygon.centerLabel, '#ffffff', showAreaLabel)
  }, [polygon?.centerLabel, showAreaLabel])

  const lotUiPayload = useMemo(
    () => ({
      strokeColor: polygon?.color || '#8e1616',
      fillColor: polygon?.fillColor || '#8e1616',
      labelColor: '#ffffff',
      segmentEdges: polygon?.segmentEdges || [],
      centerLabelHtml,
      showArea: showAreaLabel,
      showDistance: showDistanceLabel,
      area: area !== undefined && area !== null ? area : null,
    }),
    [polygon?.color, polygon?.fillColor, polygon?.segmentEdges, centerLabelHtml, showAreaLabel, showDistanceLabel, area]
  )""",
)

text = text.replace("polygon?.segmentLabels,", "polygon?.segmentEdges,")

p.write_text(text, encoding="utf-8")
print("patched")
