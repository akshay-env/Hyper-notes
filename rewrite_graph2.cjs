const fs = require('fs');
let code = fs.readFileSync('src/graph/GraphCanvas.ts', 'utf8');

// 1. Imports
code = 'import * as PIXI from "pixi.js";\n' + code;

// 2. Properties
code = code.replace(
  /private canvas: HTMLCanvasElement;\n  private ctx: CanvasRenderingContext2D;/,
  `private canvas: HTMLCanvasElement;
  private app: PIXI.Application<HTMLCanvasElement>;
  private worldContainer: PIXI.Container;
  private edgeGraphics: PIXI.Graphics;
  private nodesContainer: PIXI.Container;
  private labelsContainer: PIXI.Container;
  private nodeSprites = new Map<string, PIXI.Graphics>();
  private labelSprites = new Map<string, PIXI.Text>();`
);

// 3. rgbToHex
code = code.replace(
  /const rgbStr = \(c: Rgb\) =>\n  `rgb\(\$\{Math\.round\(c\[0\]\)\},\$\{Math\.round\(c\[1\]\)\},\$\{Math\.round\(c\[2\]\)\}\)`;/,
  `const rgbToHex = (c: Rgb) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);`
);

// 4. Constructor
code = code.replace(
  /this\.canvas = canvas;\n    this\.ctx = canvas\.getContext\("2d"\)!;/,
  `this.canvas = canvas;
    this.app = new PIXI.Application<HTMLCanvasElement>({
      view: canvas,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 1,
    });
    this.app.ticker.stop();
    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);
    this.edgeGraphics = new PIXI.Graphics();
    this.worldContainer.addChild(this.edgeGraphics);
    this.nodesContainer = new PIXI.Container();
    this.worldContainer.addChild(this.nodesContainer);
    this.labelsContainer = new PIXI.Container();
    this.worldContainer.addChild(this.labelsContainer);`
);

// 5. resize
code = code.replace(
  /this\.canvas\.width = Math\.round\(rect\.width \* this\.dpr\);\n    this\.canvas\.height = Math\.round\(rect\.height \* this\.dpr\);\n    this\.canvas\.style\.width = `\$\{rect\.width\}px`;\n    this\.canvas\.style\.height = `\$\{rect\.height\}px`;/,
  `if (this.app) { this.app.renderer.resize(this.w, this.h); }`
);

// 6. draw() -> updatePixi()
code = code.replace(/this\.draw\(\);/, `this.updatePixi();`);

// 7. destroy()
code = code.replace(
  /this\.worker = null;\n  \}/,
  `this.worker = null;\n    if (this.app) this.app.destroy(false, { children: true });\n  }`
);

// 8. Replace draw() and drawLabels()
const drawRegex = /private draw\(\): void \{[\s\S]*?\}\n\n  \/\/ Labels are the single most expensive thing[\s\S]*?private drawLabels\([^)]+\): void \{[\s\S]*?\}\n/m;

const updatePixiFn = `
  private updatePixi(): void {
    const s = this.s;
    this.app.renderer.background.color = rgbToHex(parseColor(this.colors.graphBg));
    
    this.worldContainer.position.set(this.panX, this.panY);
    this.worldContainer.scale.set(this.zoom);

    const pad = 80 / this.zoom;
    const vx0 = -this.panX / this.zoom - pad;
    const vy0 = -this.panY / this.zoom - pad;
    const vx1 = (this.w - this.panX) / this.zoom + pad;
    const vy1 = (this.h - this.panY) / this.zoom + pad;
    const nodeVisible = (x: number, y: number) => x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
    const edgeVisible = (ax: number, ay: number, bx: number, by: number) =>
      !((ax < vx0 && bx < vx0) || (ax > vx1 && bx > vx1) || (ay < vy0 && by < vy0) || (ay > vy1 && by > vy1));

    const ns = this.nodeScale();
    
    this.edgeGraphics.clear();
    this.edgeGraphics.lineStyle(s.edgeWidth * ns, rgbToHex(this.rgb.border), this.bloom * s.edgeOpacity);
    const litEdges: any[] = [];
    for (const e of this.edges) {
      const a = this.pos.get(e.from);
      const b = this.pos.get(e.to);
      if (!a || !b) continue;
      if (this.edgeGlow(e) > GraphCanvas.PLAIN_EPS) {
        litEdges.push(e);
        continue;
      }
      if (!edgeVisible(a.x, a.y, b.x, b.y)) continue;
      this.edgeGraphics.moveTo(a.x, a.y);
      this.edgeGraphics.lineTo(b.x, b.y);
    }
    
    for (const e of litEdges) {
      const a = this.pos.get(e.from)!;
      const b = this.pos.get(e.to)!;
      if (!edgeVisible(a.x, a.y, b.x, b.y)) continue;
      const glow = this.edgeGlow(e);
      const alpha = this.bloom * lerp(s.edgeOpacity, 0.94, glow);
      const color = rgbToHex(mixInto(mixBuf, this.rgb.border, this.rgb.accent, glow));
      const width = lerp(s.edgeWidth, s.highlightEdgeWidth, glow) * ns;
      this.edgeGraphics.lineStyle(width, color, alpha);
      this.edgeGraphics.moveTo(a.x, a.y);
      this.edgeGraphics.lineTo(b.x, b.y);
    }

    const fancy: Meta[] = [];
    const usedNodes = new Set<string>();
    for (const m of this.metaList) {
      usedNodes.add(m.path);
      const n = this.pos.get(m.path);
      if (!n) continue;
      
      let sprite = this.nodeSprites.get(m.path);
      if (!sprite) {
        sprite = new PIXI.Graphics();
        sprite.beginFill(0xFFFFFF);
        sprite.drawCircle(0, 0, 100);
        sprite.endFill();
        this.nodeSprites.set(m.path, sprite);
        this.nodesContainer.addChild(sprite);
      }
      
      const r = this.dotRadius(m) * m.disp * ns;
      const visible = nodeVisible(n.x, n.y);
      sprite.visible = visible;
      
      if (!visible) continue;
      
      sprite.position.set(n.x, n.y);
      sprite.scale.set(r / 100);
      
      if (this.isPlain(m)) {
        sprite.tint = rgbToHex(this.rgb.node);
        sprite.alpha = this.bloom;
      } else {
        fancy.push(m);
        const c = mixInto(mixBuf, this.rgb.node, this.rgb.nodeNeighbor, m.neighborT);
        mixInto(c, c, this.rgb.nodeActive, m.focusT);
        mixInto(c, c, this.rgb.nodeHi, m.hoverT);
        sprite.tint = rgbToHex(c);
        sprite.alpha = this.bloom * lerp(1, s.dimOpacity, m.dimT);
      }
    }
    
    for (const [path, sprite] of this.nodeSprites.entries()) {
      if (!usedNodes.has(path)) {
        this.nodesContainer.removeChild(sprite);
        sprite.destroy();
        this.nodeSprites.delete(path);
      }
    }

    this.updateLabelsPixi(s, nodeVisible, fancy);
    this.app.renderer.render(this.app.stage);
  }

  private updateLabelsPixi(
    s: GraphSettings,
    nodeVisible: (x: number, y: number) => boolean,
    fancy: Meta[],
  ): void {
    const fade = Math.max(0, Math.min(1, Math.log2(this.zoom) + 1));
    const drawPlain = s.showLabels && fade > 0.02;
    const ns = this.nodeScale();
    const usedLabels = new Set<string>();
    
    for (const m of this.metaList) {
      const isPlain = this.isPlain(m);
      if (isPlain && !drawPlain) continue;
      if (!isPlain && !s.showLabels && m.hoverT <= GraphCanvas.PLAIN_EPS) continue;
      
      const n = this.pos.get(m.path);
      if (!n || !nodeVisible(n.x, n.y)) continue;
      
      usedLabels.add(m.path);
      let text = this.labelSprites.get(m.path);
      if (!text) {
        text = new PIXI.Text(m.title, {
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontSize: 64,
          fill: 0xFFFFFF,
          align: 'center'
        });
        text.anchor.set(0.5, 0);
        this.labelSprites.set(m.path, text);
        this.labelsContainer.addChild(text);
      }
      
      text.visible = true;
      
      if (isPlain) {
        const size = Math.max(1, s.labelSize * ns);
        text.scale.set(size / 64);
        text.tint = rgbToHex(this.rgb.node);
        text.alpha = this.bloom * fade;
        text.position.set(n.x, n.y + (this.dotRadius(m) * m.disp + 5) * ns);
      } else {
        const c = mixInto(mixBuf, this.rgb.node, this.rgb.nodeNeighbor, m.neighborT);
        mixInto(c, c, this.rgb.accentText, m.focusT);
        mixInto(c, c, this.rgb.nodeHi, m.hoverT);
        
        const graphSize = s.labelSize * ns;
        const screenLockedSize = (s.labelSize * s.hoverLabelScale) / this.zoom;
        const size = lerp(graphSize, screenLockedSize, m.hoverT);
        const gap = lerp(5 * ns, 5 / this.zoom, m.hoverT);
        
        text.scale.set(size / 64);
        text.tint = rgbToHex(c);
        text.alpha = this.bloom * lerp(1, s.dimOpacity, m.dimT);
        text.position.set(n.x, n.y + this.dotRadius(m) * m.disp * ns + gap);
      }
    }
    
    for (const [path, text] of this.labelSprites.entries()) {
      if (!usedLabels.has(path)) {
        text.visible = false;
      }
    }
  }
`;

code = code.replace(drawRegex, updatePixiFn);

// One tiny fix: there are two places calling this.drawLabels in original that might be caught?
// Wait, my regex matches the whole block from "private draw():" to the end of "drawLabels():".
if (!code.includes('updatePixi()')) {
  console.log("Failed to replace draw");
} else {
  fs.writeFileSync('src/graph/GraphCanvas.ts', code);
  console.log("Rewrite successful");
}
