// ── WebGL shader sources ─────────────────────────────────────────────────
export const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
}`;

export const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_depth;
uniform vec2 u_shift;
uniform float u_zoom;
uniform vec2 u_depthTexelSize;
void main() {
  vec2 uv = (v_uv - 0.5) / u_zoom + 0.5;
  // 5-tap minimum depth: reduces foreground smear at depth discontinuities
  float d0 = texture2D(u_depth, uv).r;
  float d1 = texture2D(u_depth, uv + vec2( u_depthTexelSize.x, 0.0)).r;
  float d2 = texture2D(u_depth, uv + vec2(-u_depthTexelSize.x, 0.0)).r;
  float d3 = texture2D(u_depth, uv + vec2(0.0,  u_depthTexelSize.y)).r;
  float d4 = texture2D(u_depth, uv + vec2(0.0, -u_depthTexelSize.y)).r;
  float depth = min(d0, min(min(d1, d2), min(d3, d4)));
  vec2 displaced = uv - u_shift * depth;
  gl_FragColor = texture2D(u_image, displaced);
}`;

export function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  return prog;
}

export function setupQuad(gl: WebGLRenderingContext, prog: WebGLProgram): void {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
}

export function uploadTexture(
  gl: WebGLRenderingContext,
  unit: number,
  source: HTMLImageElement | ImageBitmap
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return tex;
}

export function uploadDepthTexture(
  gl: WebGLRenderingContext,
  unit: number,
  data: Float32Array,
  w: number,
  h: number
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Try OES_texture_float for full float32 precision (no banding)
  const extFloat = gl.getExtension("OES_texture_float");
  const extLinear = gl.getExtension("OES_texture_float_linear");
  const filter = extLinear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);

  if (extFloat) {
    // LUMINANCE+FLOAT: shader reads .r directly as float
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.FLOAT, data);
  } else {
    // Fallback: quantize to 8-bit RGBA
    const uint8 = new Uint8Array(data.length * 4);
    for (let i = 0; i < data.length; i++) {
      const v = Math.round(data[i] * 255);
      uint8[i * 4] = v; uint8[i * 4 + 1] = v; uint8[i * 4 + 2] = v; uint8[i * 4 + 3] = 255;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, uint8);
  }
  return tex;
}
