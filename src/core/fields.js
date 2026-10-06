// ============================================================================
// fields.js — per-joint attribute context, noise, and expression compilation.
//
// A "field" is a plain function (ctx) => number. Transform nodes evaluate a
// field once per selected joint, with `ctx` filled from the skeleton's typed
// arrays. Anything that can be a number can be a field, and fields nest
// (a Sine's phase can itself be a Ramp), so the old library's transform()
// argument soup (jOff, jFreq, jFract, offsetter2, nObjOff ...) becomes a
// handful of composable nodes.
// ============================================================================

// The attributes, in the order the dropdowns show them. `alias` is the short
// name the first version used; both spellings work in expressions forever.
export const ATTR_INFO = [
  { name: 'joint',   alias: 'i',    help: 'joint index along its branch, 0 at the base' },
  { name: 'joints',  alias: 'n',    help: 'how many joints the branch has' },
  { name: 'along',   alias: 't',    help: '0 to 1 from the base to the tip of the branch' },
  { name: 'rad',     alias: 'sib',  help: 'which spoke, 0 to rads-1, of the branches at one joint' },
  { name: 'rads',    alias: null,   help: 'how many spokes sprout from that joint' },
  { name: 'order',   alias: 'ord',  help: 'index of this branch among all the ones its Branch node made' },
  { name: 'orders',  alias: 'nord', help: 'how many branches that node made' },
  { name: 'across',  alias: 'u',    help: '0 to 1 over order, across all the branches the node made' },
  { name: 'parent',  alias: 'pj',   help: 'index of the joint this branch sprouts from' },
  { name: 'pfrac',   alias: null,   help: '0 to 1 position of that joint along the parent branch' },
  { name: 'gparent', alias: 'ppj',  help: 'same as parent, one generation further up' },
  { name: 'depth',   alias: null,   help: 'branch generation: 0 for trunks, +1 per Branch node' },
  { name: 'branch',  alias: 'br',   help: 'id of the branch this joint belongs to' },
  { name: 'id',      alias: null,   help: 'global joint index, unique across the whole tree' },
  { name: 'x',       alias: null,   help: 'rest position x, before any transforms' },
  { name: 'y',       alias: null,   help: 'rest position y' },
  { name: 'z',       alias: null,   help: 'rest position z' },
  { name: 'time',    alias: null,   help: 'seconds since the graph started, scaled by the speed slider' },
];

// canonical names, for the attr dropdowns
export const ATTRS = ATTR_INFO.map((a) => a.name);
// every spelling, for the expression compiler
export const ATTR_ALL = ATTR_INFO.flatMap((a) => (a.alias ? [a.name, a.alias] : [a.name]));
export const ATTR_HELP = Object.fromEntries(ATTR_INFO.map((a) => [a.name, a.help]));
const ALIASES = ATTR_INFO.filter((a) => a.alias).map((a) => [a.name, a.alias]);

export function makeCtx() {
  const c = {};
  for (const k of ATTR_ALL) c[k] = 0;
  return c;
}

export function fillCtx(c, skel, j, time) {
  const br = skel.branches[skel.branch[j]];
  const i = skel.idx[j];
  c.joint = i;
  c.joints = br.n;
  c.along = br.n > 1 ? i / (br.n - 1) : 0;
  c.rad = br.sib; c.rads = br.rads;
  c.order = br.ord; c.orders = br.nord;
  c.across = br.nord > 1 ? br.ord / (br.nord - 1) : 0;
  c.parent = br.pj; c.pfrac = br.pfrac; c.gparent = br.ppj;
  c.depth = br.depth; c.branch = br.id; c.id = j;
  c.x = skel.rest[j * 3]; c.y = skel.rest[j * 3 + 1]; c.z = skel.rest[j * 3 + 2];
  c.time = time;
  // short spellings, kept alive so old graphs and old habits keep working
  c.i = i; c.n = c.joints; c.t = c.along; c.sib = c.rad; c.ord = c.order; c.nord = c.orders;
  c.u = c.across; c.pj = c.parent; c.ppj = c.gparent; c.br = c.branch;
}

export const isField = (v) => typeof v === 'function';

/** Resolve a number-or-field for one joint. */
export function val(v, c) {
  if (typeof v === 'function') return v(c);
  return typeof v === 'number' && v === v ? v : 0;
}

/** Resolve to a plain number, for inputs that cannot take a field (structure params). */
const DEFAULT_CTX = makeCtx();
export function num(v, fallback = 0) {
  if (typeof v === 'function') { const r = v(DEFAULT_CTX); return r === r ? r : fallback; }
  if (typeof v === 'number' && v === v) return v;
  return fallback;
}

// ---------------------------------------------------------------------------
// Perlin noise (same permutation as the old library, so old sketches feel the same).
// ---------------------------------------------------------------------------
const P = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,
  190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,
  77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,
  135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,
  223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,
  251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
const perm = new Uint8Array(512);
for (let i = 0; i < 512; i++) perm[i] = P[i & 255];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (t, a, b) => a + t * (b - a);
function grad(h, x, y, z) {
  h &= 15;
  const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
export function noise(x, y = 0, z = 0) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
  return lerp(w, lerp(v, lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
                         lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))),
                 lerp(v, lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
                         lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))));
}

/** Integer hash to [0,1). Deterministic per joint, so "random" stays put between frames. */
export function hash01(n) {
  let x = Math.imul(n | 0, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const step = (edge, x) => x < edge ? 0 : 1;

// ---------------------------------------------------------------------------
// Expression compiler. Source sees every attribute (long and short spelling),
// the inputs a b c d, Math functions and the helpers above.
// ---------------------------------------------------------------------------
const HELPERS = { noise, hash: hash01, clamp, mix, smoothstep, step };
const exprCache = new Map();
/** @param names the variable names unpacked from the context (joint attributes by default) */
export function compileExpr(src, names = ATTR_ALL) {
  const text = (src || '').trim() || '0';
  const key = names.length + ':' + text;
  if (exprCache.has(key)) return exprCache.get(key);
  const body =
    `"use strict";\n` +
    `const {${names.join(',')}} = _c;\n` +
    `const a=_p.a, b=_p.b, c=_p.c, d=_p.d;\n` +
    `const {sin,cos,tan,abs,floor,ceil,round,sqrt,pow,min,max,exp,log,atan2,sign,PI} = Math;\n` +
    `const {noise,hash,clamp,mix,smoothstep,step} = _h;\n` +
    `return (${text});`;
  const f = new Function('_c', '_p', '_h', body);
  const wrapped = (c, p) => f(c, p, HELPERS);
  exprCache.set(key, wrapped);
  return wrapped;
}
export const EMPTY_INPUTS = { a: 0, b: 0, c: 0, d: 0 };
