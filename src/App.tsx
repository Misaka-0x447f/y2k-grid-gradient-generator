import {useState, useRef, useCallback, useMemo, type CSSProperties, type MouseEvent, useEffect} from "react";

// Define the type for a single color stop
interface Stop {
  position: number;
  color: string;
  isLargeEnd: boolean;
}

const DEFAULT_STOPS: Stop[] = [
  { position: 0, color: "#1a1a6e", isLargeEnd: true },
  { position: 50, color: "#c0c0c0", isLargeEnd: false },
  { position: 50, color: "#c0c0c0", isLargeEnd: false },
  { position: 100, color: "#6e1a1a", isLargeEnd: true },
];

// --- URL State Sync ---

function base64ToUint8Array(base64: string): Uint8Array {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

function getInitialState() {
  const defaults = {
    width: 400,
    height: 80,
    squareSize: 8,
    sizeStep: 1,
    selector: "#gradient-target",
    stops: DEFAULT_STOPS,
    bgColor: "#c0c0c0",
  };

  const params = new URLSearchParams(window.location.search);
  const config = params.get('config');

  if (config) {
    try {
      const uint8array = base64ToUint8Array(config);
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(uint8array);
      const decoded = JSON.parse(jsonString);

      if (typeof decoded === 'object' && decoded !== null) {
        return {
          width: typeof decoded.width === 'number' ? decoded.width : defaults.width,
          height: typeof decoded.height === 'number' ? decoded.height : defaults.height,
          squareSize: typeof decoded.squareSize === 'number' ? decoded.squareSize : defaults.squareSize,
          sizeStep: typeof decoded.sizeStep === 'number' ? decoded.sizeStep : defaults.sizeStep,
          selector: typeof decoded.selector === 'string' ? decoded.selector : defaults.selector,
          stops: Array.isArray(decoded.stops) ? decoded.stops : defaults.stops,
          bgColor: typeof decoded.bgColor === 'string' ? decoded.bgColor : defaults.bgColor,
        };
      }
    } catch (e) {
      console.error("Failed to parse config from URL", e);
    }
  }
  return defaults;
}

const initialState = getInitialState();

// --- End URL State Sync ---

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Main SVG generation logic
function generateGradientSVG(width: number, height: number, squareSize: number, stops: Stop[], globalBg: string, sizeStep: number = 1): string {
  const cols = Math.ceil(width / squareSize);
  const rows = Math.ceil(height / squareSize);
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);

  // Build segments between adjacent stops
  const segments: Array<{
    startPct: number; endPct: number;
    fgColor: string | null; bgColor: string | null; largeAtStart: boolean | null;
    s0: Stop; s1: Stop;
  }> = [];
  for (let i = 0; i < sortedStops.length - 1; i++) {
    const s0 = sortedStops[i];
    const s1 = sortedStops[i + 1];

    let fgColor: string | null, bgColor: string | null, largeAtStart: boolean | null;
    if (s0.isLargeEnd && !s1.isLargeEnd) {
      fgColor = s0.color;
      bgColor = s1.color;
      largeAtStart = true;
    } else if (!s0.isLargeEnd && s1.isLargeEnd) {
      fgColor = s1.color;
      bgColor = s0.color;
      largeAtStart = false;
    } else if (s0.isLargeEnd && s1.isLargeEnd) {
      fgColor = s0.color;
      bgColor = null;
      largeAtStart = null;
    } else {
      fgColor = null;
      bgColor = s0.color;
      largeAtStart = null;
    }

    segments.push({ startPct: s0.position, endPct: s1.position, fgColor, bgColor, largeAtStart, s0, s1 });
  }

  function getCellInfo(xPercent: number): { fg: string | null; bg: string | null; size: number } {
    if (sortedStops.length === 0) return { fg: "#000", bg: globalBg, size: 1 };

    if (xPercent <= sortedStops[0].position) {
      const s = sortedStops[0];
      return s.isLargeEnd ? { fg: s.color, bg: globalBg, size: 1 } : { fg: null, bg: s.color, size: 0 };
    }
    if (xPercent >= sortedStops[sortedStops.length - 1].position) {
      const s = sortedStops[sortedStops.length - 1];
      return s.isLargeEnd ? { fg: s.color, bg: globalBg, size: 1 } : { fg: null, bg: s.color, size: 0 };
    }

    for (const seg of segments) {
      if (xPercent >= seg.startPct && xPercent <= seg.endPct) {
        const range = seg.endPct - seg.startPct;
        const t = range === 0 ? 0 : (xPercent - seg.startPct) / range;
        const eased = smoothstep(t);

        if (seg.largeAtStart === true) {
          return { fg: seg.fgColor, bg: seg.bgColor, size: 1 - eased };
        } else if (seg.largeAtStart === false) {
          return { fg: seg.fgColor, bg: seg.bgColor, size: eased };
        } else if (seg.fgColor !== null) {
          return { fg: seg.s0.color, bg: globalBg, size: 1 };
        } else {
          return { fg: null, bg: seg.bgColor, size: 0 };
        }
      }
    }
    return { fg: "#000", bg: globalBg, size: 1 };
  }

  const elements: string[] = [];
  elements.push(`<rect width="${width}" height="${height}" fill="${globalBg}"/>`);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellX = col * squareSize;
      const cellY = row * squareSize;
      const cx = cellX + squareSize / 2;
      const xPercent = (cx / width) * 100;

      const { fg, bg, size } = getCellInfo(xPercent);

      if (bg && bg !== globalBg) {
        elements.push(
          `<rect x="${cellX}" y="${cellY}" width="${squareSize}" height="${squareSize}" fill="${bg}"/>`
        );
      }

      if (fg && size > 0.001) {
        const rawSize = squareSize * size;
        if (sizeStep > 0 && sizeStep < squareSize) {
          const lower = Math.floor(rawSize / sizeStep) * sizeStep;
          const upper = lower + sizeStep;
          const frac = (rawSize - lower) / sizeStep;

          if (lower > 0) {
            const sx = cx - lower / 2;
            const sy = cellY + squareSize / 2 - lower / 2;
            elements.push(
              `<rect x="${sx.toFixed(2)}" y="${sy.toFixed(2)}" width="${lower.toFixed(2)}" height="${lower.toFixed(2)}" fill="${fg}" shape-rendering="geometricPrecision"/>`
            );
          }
          if (frac > 0.001 && upper <= squareSize) {
            const sx = cx - upper / 2;
            const sy = cellY + squareSize / 2 - upper / 2;
            elements.push(
              `<rect x="${sx.toFixed(2)}" y="${sy.toFixed(2)}" width="${upper.toFixed(2)}" height="${upper.toFixed(2)}" fill="${fg}" opacity="${frac.toFixed(3)}" shape-rendering="geometricPrecision"/>`
            );
          }
        } else {
          if (rawSize > 0) {
            const sx = cx - rawSize / 2;
            const sy = cellY + squareSize / 2 - rawSize / 2;
            elements.push(
              `<rect x="${sx.toFixed(2)}" y="${sy.toFixed(2)}" width="${rawSize.toFixed(2)}" height="${rawSize.toFixed(2)}" fill="${fg}" shape-rendering="geometricPrecision"/>`
            );
          }
        }
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${elements.join("\n")}
</svg>`;
}

// Define props for the StopEditor component
interface StopEditorProps {
  stop: Stop;
  index: number;
  onChange: (newStop: Stop) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function StopEditor({ stop, index, onChange, onRemove, canRemove }: StopEditorProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
      borderBottom: "1px solid #bbb", fontSize: 13,
    }}>
      <span style={{ width: 20, color: "#666", fontWeight: 600 }}>#{index + 1}</span>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#444", minWidth: 28 }}>Pos</span>
        <input
          type="number" min={0} max={100} step={1}
          value={stop.position}
          onChange={(e) => onChange({ ...stop, position: Number(e.target.value) })}
          style={{ width: 52, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace" }}
        />
        <span style={{ color: "#888" }}>%</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#444" }}>Color</span>
        <input
          type="color" value={stop.color}
          onChange={(e) => onChange({ ...stop, color: e.target.value })}
          style={{ width: 28, height: 22, padding: 0, border: "1px solid #999", cursor: "pointer" }}
        />
        <input
          type="text" value={stop.color}
          onChange={(e) => onChange({ ...stop, color: e.target.value })}
          style={{ width: 72, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace", fontSize: 12 }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        <input
          type="checkbox" checked={stop.isLargeEnd}
          onChange={(e) => onChange({ ...stop, isLargeEnd: e.target.checked })}
        />
        <span style={{ color: "#444", fontSize: 12 }}>Large</span>
      </label>
      {canRemove && (
        <button onClick={onRemove} style={{
          background: "#d44", color: "white", border: "none", borderRadius: 2,
          padding: "2px 8px", cursor: "pointer", fontSize: 12, marginLeft: "auto",
        }}>✕</button>
      )}
    </div>
  );
}

export default function App() {
  const [width, setWidth] = useState<number>(initialState.width);
  const [height, setHeight] = useState<number>(initialState.height);
  const [squareSize, setSquareSize] = useState<number>(initialState.squareSize);
  const [sizeStep, setSizeStep] = useState<number>(initialState.sizeStep);
  const [selector, setSelector] = useState<string>(initialState.selector);
  const [stops, setStops] = useState<Stop[]>(initialState.stops);
  const [bgColor, setBgColor] = useState<string>(initialState.bgColor);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const state = { width, height, squareSize, sizeStep, selector, stops, bgColor };
    const encoder = new TextEncoder();
    const uint8array = encoder.encode(JSON.stringify(state));

    let binary = '';
    uint8array.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const encoded = btoa(binary);

    const params = new URLSearchParams();
    params.set('config', encoded);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [width, height, squareSize, sizeStep, selector, stops, bgColor]);

  const svgString = useMemo(() => {
    return generateGradientSVG(width, height, squareSize, stops, bgColor, sizeStep);
  }, [width, height, squareSize, stops, bgColor, sizeStep]);

  const updateStop = useCallback((index: number, newStop: Stop) => {
    setStops((prev) => prev.map((s, i) => (i === index ? newStop : s)));
  }, []);

  const removeStop = useCallback((index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addStop = useCallback(() => {
    setStops((prev) => [...prev, { position: 50, color: "#333333", isLargeEnd: false }]);
  }, []);

  const handleDownload = useCallback(() => {
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "y2k-gradient.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [svgString]);

  const handleCopyCode = useCallback(() => {
    const code = `// Y2K Gradient - Apply to "${selector}"
function applyY2KGradient() {
  const target = document.querySelector('${selector}');
  if (!target) { console.warn('Target not found: ${selector}'); return; }
  const svgData = \`${svgString.replace(/`/g, "\\`")}\`;
  const encoded = 'data:image/svg+xml,' + encodeURIComponent(svgData);
  target.style.backgroundImage = 'url("' + encoded + '")';
  target.style.backgroundSize = '${width}px ${height}px';
}
applyY2KGradient();`;
    navigator.clipboard.writeText(code).catch(() => {});
  }, [svgString, selector, width, height]);

  const handleCopySVG = useCallback(() => {
    navigator.clipboard.writeText(svgString).catch(() => {});
  }, [svgString]);

  const panelStyle: CSSProperties = {
    background: "#d4d0c8", border: "2px solid",
    borderColor: "#fff #808080 #808080 #fff", padding: 12, marginBottom: 8,
  };
  const titleBarStyle: CSSProperties = {
    background: "linear-gradient(90deg, #0a246a, #3a6ea5)", color: "white",
    fontWeight: 700, fontSize: 13, padding: "3px 6px", marginBottom: 8,
    fontFamily: "Tahoma, sans-serif", display: "flex", alignItems: "center", gap: 6,
  };
  const btnStyle: CSSProperties = {
    background: "#d4d0c8", border: "2px solid",
    borderColor: "#fff #808080 #808080 #fff", padding: "4px 14px",
    cursor: "pointer", fontFamily: "Tahoma, sans-serif", fontSize: 12, fontWeight: 600,
  };
  const btnDown = (e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "#808080 #fff #fff #808080"; };
  const btnUp = (e: MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = "#fff #808080 #808080 #fff"; };

  return (
    <div style={{
      fontFamily: "Tahoma, 'MS Sans Serif', sans-serif",
      minHeight: "100vh", color: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{
          background: "#d4d0c8", border: "2px solid",
          borderColor: "#fff #808080 #808080 #fff", boxShadow: "1px 1px 0 #000",
        }}>
          <div style={titleBarStyle}>
            <span style={{ width: 14, height: 14, background: "#d4d0c8", border: "1px solid #808080", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#000", fontWeight: 400 }}>◆</span>
            Y2K Gradient Generator
          </div>

          <div style={{ padding: 10 }}>
            <div style={panelStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#333" }}>Output Settings</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Selector
                  <input value={selector} onChange={(e) => setSelector(e.target.value)}
                    style={{ width: 140, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace", fontSize: 12 }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Width
                  <input type="number" value={width} min={10} max={2000} onChange={(e) => setWidth(Number(e.target.value))}
                    style={{ width: 56, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Height
                  <input type="number" value={height} min={10} max={2000} onChange={(e) => setHeight(Number(e.target.value))}
                    style={{ width: 56, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Square
                  <input type="number" value={squareSize} min={2} max={64} onChange={(e) => setSquareSize(Number(e.target.value))}
                    style={{ width: 46, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace" }} />
                  <span style={{ color: "#888" }}>px</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Step
                  <input type="number" value={sizeStep} min={0.1} max={squareSize} step={0.1} onChange={(e) => setSizeStep(Number(e.target.value))}
                    style={{ width: 46, padding: "2px 4px", border: "1px solid #999", fontFamily: "monospace" }} />
                  <span style={{ color: "#888" }}>px</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  BG
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: 28, height: 20, padding: 0, border: "1px solid #999", cursor: "pointer" }} />
                </label>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Color Stops</span>
                <button onClick={addStop} onMouseDown={btnDown} onMouseUp={btnUp} onMouseLeave={btnUp} style={{ ...btnStyle, fontSize: 11, padding: "2px 10px" }}>+ Add Stop</button>
              </div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                "Large" = full-size squares (foreground color). Unchecked = background color (squares shrink to zero revealing this color).
              </div>
              {stops.map((stop, i) => (
                <StopEditor key={i} stop={stop} index={i}
                  onChange={(s) => updateStop(i, s)}
                  onRemove={() => removeStop(i)}
                  canRemove={stops.length > 2} />
              ))}
            </div>

            <div style={panelStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#333" }}>Preview</div>
              <div ref={svgContainerRef} style={{
                border: "2px solid", borderColor: "#808080 #fff #fff #808080",
                background: "#fff", padding: 4, overflow: "auto", maxHeight: 400,
              }} dangerouslySetInnerHTML={{ __html: svgString }} />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleDownload} onMouseDown={btnDown} onMouseUp={btnUp} onMouseLeave={btnUp} style={btnStyle}>💾 Download SVG</button>
              <button onClick={handleCopySVG} onMouseDown={btnDown} onMouseUp={btnUp} onMouseLeave={btnUp} style={btnStyle}>📋 Copy SVG</button>
              <button onClick={handleCopyCode} onMouseDown={btnDown} onMouseUp={btnUp} onMouseLeave={btnUp} style={btnStyle}>📝 Copy JS Code</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
