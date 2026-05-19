/**
 * Historical compare — Esri ArcGIS World Imagery Wayback (dated satellite releases).
 * Swipe widget; left/right panes pick imagery date from ArcGIS Wayback tile service.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MapNorthCompassOverlay, MAP_COMPASS_CONTROL_TOP } from './MapNorthCompassOverlay'
import { WAYBACK_RELEASES } from './arcgis-wayback'
import { buildCenterLabelLines, type MapCenterLabel, type MapSegmentEdge } from './map-label-utils'
import {
  buildCompareLotMapUiPayload,
  resolveMapSettings,
  type MapSettings,
} from './map-settings'
import { safeJsonForScript } from './map-helpers'
import './CompareBasemapMap.css'

interface CompareBasemapMapProps {
  center: { lat: number; lng: number }
  zoom?: number
  polygon?: {
    coordinates: [number, number][]
    color?: string
    segmentEdges?: MapSegmentEdge[]
    centerLabel?: MapCenterLabel
  } | null
  area?: number
  mapSettings?: MapSettings
  onRegionChange?: (center: { lat: number; lng: number }, zoom: number) => void
}

export default function CompareBasemapMap({
  center,
  zoom = 17,
  polygon,
  area,
  mapSettings: mapSettingsProp,
  onRegionChange,
}: CompareBasemapMapProps) {
  const mapSettings = useMemo(
    () =>
      resolveMapSettings(mapSettingsProp, {
        polygonColor: polygon?.color,
      }),
    [mapSettingsProp, polygon?.color]
  )

  const polyCoordsKey = useMemo(
    () => JSON.stringify(polygon?.coordinates ?? null),
    [polygon?.coordinates]
  )
  const [leftIdx, setLeftIdx] = useState(0)
  const [rightIdx, setRightIdx] = useState(3)
  const [uiVisible, setUiVisible] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [mapRotation, setMapRotation] = useState(0)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onRegionChangeRef = useRef(onRegionChange)
  onRegionChangeRef.current = onRegionChange

  const leftVersion = WAYBACK_RELEASES[leftIdx]
  const rightVersion = WAYBACK_RELEASES[rightIdx]

  const htmlContent = useMemo(() => {
    const polyStr = safeJsonForScript(polygon || null)

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no">
<title>ArcGIS Wayback Compare</title>
<link rel="stylesheet" href="https://js.arcgis.com/4.28/esri/themes/light/main.css">
<script src="https://js.arcgis.com/4.28/"></script>
<style>
  html, body, #viewDiv { padding:0; margin:0; height:100%; width:100%; background:#1e1e1e; }
  .year-label {
    position:absolute; top:20px; padding:6px 10px; background:rgba(0,0,0,0.65);
    color:white; font-family:system-ui,sans-serif; font-size:12px; font-weight:bold;
    border-radius:4px; z-index:99; pointer-events:none; box-shadow:0 2px 4px rgba(0,0,0,0.3);
  }
  #label-left { left:20px; } #label-right { right:20px; }
  #fitLotPolygonBtn {
    display:none; position:absolute; bottom:52px; right:12px; z-index:120;
    padding:10px 14px; font-family:system-ui,sans-serif; font-size:13px; font-weight:600;
    color:#fff; background:#3b5998; border:none; border-radius:8px;
    box-shadow:0 2px 8px rgba(0,0,0,0.35); cursor:pointer;
  }
  #loading {
    position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
    color:white; font-family:sans-serif; font-size:14px; z-index:90;
  }
</style>
</head>
<body>
<div id="loading">Loading ArcGIS imagery…</div>
<div id="viewDiv"></div>
<button type="button" id="fitLotPolygonBtn">Locate lot</button>
<div id="label-left" class="year-label"></div>
<div id="label-right" class="year-label"></div>
<script>
window.addEventListener("message", function(event) {
  var data = event.data;
  if (data && data.type === "UPDATE_LAYERS" && window.setCompareLayers) {
    window.setCompareLayers(data.leftId, data.rightId, data.leftDate, data.rightDate);
  }
  if (data && data.type === "TOGGLE_LABELS" && window.toggleLabels) {
    window.toggleLabels(data.show);
  }
  if (data && data.type === "APPLY_LOT_UI" && typeof window.lotPlotterApplyCompareUi === "function") {
    window.lotPlotterApplyCompareUi(data.payload);
  }
  if (data && data.type === "RESET_NORTH" && typeof window.iassessResetNorth === "function") {
    window.iassessResetNorth();
  }
});

require([
  "esri/Map", "esri/views/MapView", "esri/layers/WebTileLayer", "esri/widgets/Swipe",
  "esri/Graphic", "esri/layers/GraphicsLayer", "esri/geometry/Polygon", "esri/symbols/TextSymbol",
  "esri/geometry/Point"
], function(Map, MapView, WebTileLayer, Swipe, Graphic, GraphicsLayer, Polygon, TextSymbol, Point) {

  window.esriWebTileLayer = WebTileLayer;
  var WB = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/";

  var layerLeft = new WebTileLayer({ urlTemplate: WB + "27982/{level}/{row}/{col}", title: "Left" });
  var layerRight = new WebTileLayer({ urlTemplate: WB + "45441/{level}/{row}/{col}", title: "Right" });
  var roadsLayer = new WebTileLayer({
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{level}/{row}/{col}",
    title: "Roads", visible: ${showLabels}
  });
  var labelsLayer = new WebTileLayer({
    urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{level}/{row}/{col}",
    title: "Labels", visible: ${showLabels}
  });

  var map = new Map({ layers: [layerLeft, layerRight, roadsLayer, labelsLayer] });
  var view = new MapView({
    container: "viewDiv",
    map: map,
    center: [${center.lng}, ${center.lat}],
    zoom: ${zoom}
  });

  view.when(function() { document.getElementById('loading').style.display = 'none'; });

  var swipe = new Swipe({ leadingLayers: [layerLeft], trailingLayers: [layerRight], position: 50, view: view });
  view.ui.add(swipe);
  view.ui.remove("zoom");
  view.ui.remove("attribution");

  window.iassessResetNorth = function() { if (view) view.rotation = 0; };
  window.map = map; window.swipe = swipe;
  window.leftLayer = layerLeft; window.rightLayer = layerRight;
  window.roadsLayer = roadsLayer; window.labelsLayer = labelsLayer;

  window.toggleLabels = function(show) {
    if (window.roadsLayer) window.roadsLayer.visible = show;
    if (window.labelsLayer) window.labelsLayer.visible = show;
  };

  window.distanceGraphics = [];
  window.areaGraphics = [];
  var LABEL_WHITE = "#ffffff";
  var LABEL_HALO = "#000000";
  function clearLabelGraphics() {
    (window.distanceGraphics || []).forEach(function(g) { try { window.lotGraphicsLayer.remove(g); } catch(e) {} });
    (window.areaGraphics || []).forEach(function(g) { try { window.lotGraphicsLayer.remove(g); } catch(e) {} });
    window.distanceGraphics = [];
    window.areaGraphics = [];
  }
  function edgeAngleDeg(p1, p2) {
    var dx = p2[0]-p1[0], dy = p2[1]-p1[1];
    var angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;
    return angleDeg;
  }
  function buildLabelGraphics(coords, opts) {
    if (!window.lotGraphicsLayer || !coords || !coords.length) return;
    var labelColor = opts.labelColor || LABEL_WHITE;
    var segmentEdges = Array.isArray(opts.segmentEdges) ? opts.segmentEdges : [];
    if (opts.showDistance === true) {
      for (var i = 0; i < coords.length - 1; i++) {
        var p1 = coords[i], p2 = coords[i+1];
        var dist = calcDist(p1[1], p1[0], p2[1], p2[0]);
        var midLat = (p1[1]+p2[1])/2, midLng = (p1[0]+p2[0])/2;
        var edge = segmentEdges[i];
        var bearingLine = edge && edge.bearing ? edge.bearing : toLotPlanBearingLabel(p1, p2);
        var distLine = edge && edge.distanceM != null ? (Number(edge.distanceM).toFixed(2)+' m.') : (dist.toFixed(2)+' m.');
        var textGraphic = new Graphic({
          geometry: new Point({ longitude: midLng, latitude: midLat }),
          symbol: new TextSymbol({
            text: bearingLine + '\\n' + distLine,
            color: labelColor,
            haloColor: LABEL_HALO,
            haloSize: 2,
            angle: edgeAngleDeg(p1, p2),
            font: { size: 9, weight: "bold" }
          })
        });
        window.lotGraphicsLayer.add(textGraphic);
        window.distanceGraphics.push(textGraphic);
      }
    }
    if (opts.showArea === true) {
      var centroid = calcCentroid(coords);
      var centerText = '';
      if (opts.centerLines && opts.centerLines.length) {
        centerText = opts.centerLines.join('\\n');
      } else {
        var displayArea = opts.area != null ? opts.area : calcArea(coords);
        centerText = 'A=' + displayArea.toFixed(3) + ' Sq.m.';
      }
      var areaGraphic = new Graphic({
        geometry: new Point({ longitude: centroid.lng, latitude: centroid.lat }),
        symbol: new TextSymbol({
          text: centerText,
          color: labelColor,
          haloColor: LABEL_HALO,
          haloSize: 2,
          angle: 0,
          font: { size: 10, weight: "bold" }
        })
      });
      window.lotGraphicsLayer.add(areaGraphic);
      window.areaGraphics.push(areaGraphic);
    }
  }
  window.lotPlotterApplyCompareUi = function(opts) {
    if (!opts || !window._polyData || !window.lotGraphicsLayer) return;
    var stroke = opts.strokeColor || "#8e1616";
    if (window.lotPolygonGraphic) {
      window.lotPolygonGraphic.symbol = {
        type: "simple-fill", color: [142,22,22,0], outline: { color: stroke, width: 2 }
      };
    }
    clearLabelGraphics();
    buildLabelGraphics(window._polyData.coordinates, opts);
  };

  window.setCompareLayers = function(lId, rId, lDate, rDate) {
    if (!window.map || !window.swipe) return;
    var newLeft = new window.esriWebTileLayer({ urlTemplate: WB + lId + "/{level}/{row}/{col}" });
    var newRight = new window.esriWebTileLayer({ urlTemplate: WB + rId + "/{level}/{row}/{col}" });
    window.map.addMany([newLeft, newRight], 0);
    window.swipe.leadingLayers = [newLeft];
    window.swipe.trailingLayers = [newRight];
    if (window.leftLayer && window.rightLayer) {
      window.map.removeMany([window.leftLayer, window.rightLayer]);
    }
    window.swipe.scheduleRender();
    window.leftLayer = newLeft;
    window.rightLayer = newRight;
    var el = document.getElementById('label-left'); if (el) el.innerText = lDate || lId;
    el = document.getElementById('label-right'); if (el) el.innerText = rDate || rId;
  };

  function iassessPostArcRegion() {
    var rot = view.rotation != null && !isNaN(view.rotation) ? view.rotation : 0;
    var msg = {
      type: 'REGION_CHANGE',
      center: { lat: view.center.latitude, lng: view.center.longitude },
      zoom: view.zoom,
      rotation: rot
    };
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  }
  view.watch("extent", iassessPostArcRegion);
  view.watch("rotation", iassessPostArcRegion);

  function calcDist(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  function calcCentroid(coords) {
    var lat = 0, lng = 0, n = coords.length - 1;
    for (var i = 0; i < n; i++) { lat += coords[i][1]; lng += coords[i][0]; }
    return { lat: lat/n, lng: lng/n };
  }
  function calcArea(coords) {
    if (!coords || coords.length < 3) return 0;
    var a = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      a += (coords[i][0] * coords[i+1][1]) - (coords[i+1][0] * coords[i][1]);
    }
    a = Math.abs(a) / 2;
    return a * 110574 * (111320 * Math.cos(12 * Math.PI / 180));
  }
  function toLotPlanBearingLabel(p1, p2) {
    var dx = p2[0]-p1[0], dy = p2[1]-p1[1];
    var angleDeg = Math.atan2(dx, dy) * 180 / Math.PI;
    var azimuth = (angleDeg + 360) % 360;
    var quadrant = azimuth <= 180 ? azimuth : 360 - azimuth;
    var deg = Math.floor(quadrant), min = Math.round((quadrant - deg) * 60);
    var d = String(deg).padStart(2,'0'), m = String(min).padStart(2,'0');
    if (azimuth < 90) return 'N '+d+'°'+m+"' E";
    if (azimuth < 180) return 'S '+d+'°'+m+"' E";
    if (azimuth < 270) return 'S '+d+'°'+m+"' W";
    return 'N '+d+'°'+m+"' W";
  }

  window.fitLotPolygonToView = function() {
    if (!view || !window._lotPolygonGeom) return;
    view.goTo({ target: window._lotPolygonGeom, padding: 60 }).catch(function() {});
  };
  var fitLotBtn = document.getElementById("fitLotPolygonBtn");
  if (fitLotBtn) fitLotBtn.addEventListener("click", function() { window.fitLotPolygonToView(); });

  var polyData = ${polyStr};
  var polyArea = ${area !== undefined && area !== null ? area : 'null'};

  if (polyData && polyData.coordinates && polyData.coordinates.length > 0) {
    window.lotGraphicsLayer = new GraphicsLayer();
    map.add(window.lotGraphicsLayer);
    window._polyData = polyData;
    var rings = polyData.coordinates.map(function(c) { return [c[0], c[1]]; });
    var stroke = polyData.color || "#8e1616";
    window.lotPolygonGraphic = new Graphic({
      geometry: new Polygon({ rings: [rings] }),
      symbol: { type: "simple-fill", color: [142,22,22,0], outline: { color: stroke, width: 2 } }
    });
    window.lotGraphicsLayer.add(window.lotPolygonGraphic);
    window._lotPolygonGeom = window.lotPolygonGraphic.geometry;
    if (fitLotBtn) fitLotBtn.style.display = "block";
    window.lotPlotterApplyCompareUi({
      strokeColor: stroke,
      labelColor: LABEL_WHITE,
      segmentEdges: polyData.segmentEdges || [],
      centerLines: [],
      showDistance: false,
      showArea: false,
      area: polyArea
    });
    view.goTo({ target: window._lotPolygonGeom, padding: 60 }).catch(function() {});
  }

  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'MAP_READY' }, '*');
  }
});
</script>
</body>
</html>`
  }, [center.lat, center.lng, zoom, polyCoordsKey, area, showLabels])

  const postToIframe = useCallback((payload: object) => {
    iframeRef.current?.contentWindow?.postMessage(payload, '*')
  }, [])

  const centerLines = useMemo(() => {
    const centerLabel: MapCenterLabel = polygon?.centerLabel ?? {
      areaSqm: area ?? 0,
      lotNo: null,
      claimant: null,
    }
    return buildCenterLabelLines(centerLabel, true)
  }, [polygon?.centerLabel, area])

  const lotUiPayload = useMemo(
    () =>
      buildCompareLotMapUiPayload({
        settings: mapSettings,
        segmentEdges: polygon?.segmentEdges,
        centerLines,
        area,
      }),
    [mapSettings, polygon?.segmentEdges, centerLines, area]
  )

  const lotUiPayloadRef = useRef(lotUiPayload)
  lotUiPayloadRef.current = lotUiPayload

  useLayoutEffect(() => {
    postToIframe({ type: 'APPLY_LOT_UI', payload: lotUiPayload })
  }, [lotUiPayload, postToIframe])

  useEffect(() => {
    postToIframe({
      type: 'UPDATE_LAYERS',
      leftId: leftVersion.id,
      rightId: rightVersion.id,
      leftDate: leftVersion.date,
      rightDate: rightVersion.date,
    })
  }, [leftIdx, rightIdx, leftVersion, rightVersion, postToIframe])

  useEffect(() => {
    postToIframe({ type: 'TOGGLE_LABELS', show: showLabels })
  }, [showLabels, postToIframe])

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data.type === 'MAP_READY') {
          postToIframe({
            type: 'UPDATE_LAYERS',
            leftId: leftVersion.id,
            rightId: rightVersion.id,
            leftDate: leftVersion.date,
            rightDate: rightVersion.date,
          })
          postToIframe({ type: 'APPLY_LOT_UI', payload: lotUiPayloadRef.current })
        }
        if (data.type === 'REGION_CHANGE') {
          if (typeof data.rotation === 'number' && !Number.isNaN(data.rotation)) {
            setMapRotation(data.rotation)
          }
          onRegionChangeRef.current?.(data.center, data.zoom)
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [leftVersion, rightVersion, postToIframe])

  return (
    <div className="compare-basemap-map">
      <iframe
        ref={iframeRef}
        key={polyCoordsKey}
        srcDoc={htmlContent}
        title="ArcGIS historical compare"
        className="compare-basemap-map__iframe"
      />
      <div className="compare-basemap-map__compass" style={{ top: MAP_COMPASS_CONTROL_TOP }}>
        <MapNorthCompassOverlay
          bearingDeg={mapRotation}
          onResetNorth={() => postToIframe({ type: 'RESET_NORTH' })}
        />
      </div>
      <button
        type="button"
        className="compare-basemap-map__labels-btn"
        onClick={() => setShowLabels(!showLabels)}
      >
        <input type="checkbox" readOnly checked={showLabels} tabIndex={-1} aria-hidden />
        <span>Reference label overlay</span>
      </button>
      {uiVisible ? (
        <>
          <aside className="compare-basemap-map__sidebar compare-basemap-map__sidebar--left">
            <p className="compare-basemap-map__sidebar-title">Left (date)</p>
            <p className="compare-basemap-map__sidebar-sub">{leftVersion.date}</p>
            <div className="compare-basemap-map__sidebar-list">
              {WAYBACK_RELEASES.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  className={`compare-basemap-map__date-btn${leftIdx === i ? ' compare-basemap-map__date-btn--active' : ''}`}
                  onClick={() => setLeftIdx(i)}
                >
                  {v.date}
                </button>
              ))}
            </div>
          </aside>
          <aside className="compare-basemap-map__sidebar compare-basemap-map__sidebar--right">
            <p className="compare-basemap-map__sidebar-title">Right (date)</p>
            <p className="compare-basemap-map__sidebar-sub">{rightVersion.date}</p>
            <div className="compare-basemap-map__sidebar-list">
              {WAYBACK_RELEASES.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  className={`compare-basemap-map__date-btn${rightIdx === i ? ' compare-basemap-map__date-btn--active' : ''}`}
                  onClick={() => setRightIdx(i)}
                >
                  {v.date}
                </button>
              ))}
            </div>
          </aside>
        </>
      ) : null}
      <button
        type="button"
        className="compare-basemap-map__toggle-panels"
        onClick={() => setUiVisible(!uiVisible)}
      >
        {uiVisible ? 'Hide dates' : 'Show dates'}
      </button>
    </div>
  )
}
