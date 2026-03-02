import { CalculatorCompute } from './compute';
import { generateMockData } from './mock';
import { resolveTimingCard, pendingCard, populateTable, populateStringTable } from './utils/renderer';
import { STRING_STRIDE } from './shaders/stringShader';
import { GraphRenderer } from './utils/graphRenderer';

// How many rows to show in the NPV table (full 1 M would be impractical).
const DISPLAY_ROWS = 100;
// How many cheapest entries to display for the Lowest calc.
const LOWEST_TOP = 5;
// Fallback CAD→EUR rate if the live fetch fails (March 2026 approximate).
const EUR_FALLBACK = 0.68;

// Random rebate between 10 % and 50 %, fixed for the entire page session.
const REBATE_RATE = Math.random() * 0.4 + 0.1;

// JS NPV is O(n × 60 pow()) — skip the JS path above this to avoid freezing the tab.
const NPV_JS_MAX     = 1_000_000;
// Each String entry needs STRING_STRIDE × 4 bytes per buffer; skip GPU above this (~384 MB).
const STRING_GPU_MAX = 1_000_000;

// ── EUR formatter (closure; rate baked in at runtime) ─────────────────────────
function makeEurFormatter(): (v: number) => string {
    return (v) => new Intl.NumberFormat('en-CA', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
    }).format(v);
}

// ── String encode / decode ─────────────────────────────────────────────────────
// Encodes an array of strings into a flat Uint32Array (UTF-32, STRING_STRIDE slots each).
function encodeStrings(strs: string[]): Uint32Array<ArrayBuffer> {
    const buf = new Uint32Array(strs.length * STRING_STRIDE);
    for (let s = 0; s < strs.length; s++) {
        const base = s * STRING_STRIDE;
        const len  = Math.min(strs[s].length, STRING_STRIDE - 1);
        for (let i = 0; i < len; i++) {
            buf[base + i] = strs[s].codePointAt(i) ?? 0;
        }
        // remaining slots are already 0 (null terminator)
    }
    return buf;
}

function decodeString(buf: Uint32Array, stringIndex: number): string {
    const base = stringIndex * STRING_STRIDE;
    let result = '';
    for (let i = 0; i < STRING_STRIDE; i++) {
        const c = buf[base + i];
        if (c === 0) break;
        result += String.fromCodePoint(c);
    }
    return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function setFormulaBlock(html: string): void {
    const el = document.getElementById('formula-block');
    if (el) el.innerHTML = html;
}

function setRebateHeaders(text: string): void {
    document.querySelectorAll<HTMLElement>('.th-rebate').forEach(el => { el.textContent = text; });
}

/** Rebuilds both table headers to match the column layout required by the active calc. */
function setTableHeads(type: 'standard' | 'string'): void {
    const rows = document.querySelectorAll<HTMLElement>('.table-head-row');
    if (type === 'standard') {
        rows.forEach(row => {
            row.innerHTML =
                '<th>#</th>' +
                '<th>Nameplate</th>' +
                '<th class="col-price">Price (CAD)</th>' +
                '<th class="col-rebate th-rebate">—</th>';
        });
    } else {
        rows.forEach(row => {
            row.innerHTML =
                '<th>#</th>' +
                '<th>Original</th>' +
                '<th class="col-processed">Processed</th>';
        });
    }
}

/** Returns the indices of the N smallest values in arr, sorted ascending. */
function topNIndices(arr: Float32Array, n: number): number[] {
    const indices = Array.from({ length: arr.length }, (_, i) => i);
    indices.sort((a, b) => arr[a] - arr[b]);
    return indices.slice(0, n);
}

// ── Formula HTML strings ───────────────────────────────────────────────────────
const NPV_FORMULA_HTML = `
    <div class="formula-title">Calculation — Net Present Value of a deferred 10% rebate</div>
    <div class="formula-line">NPV = &Sigma;(m=1..60) &nbsp;[ (P &times; 0.1 / 60) / (1 + r)<sup>m</sup> ]</div>
    <div class="formula-vars">
        <span>P</span> = vehicle price (CAD) &nbsp;&mdash;&nbsp;
        <span>r</span> = 0.05 / 12 &asymp; 0.004167 (monthly rate at 5% annual) &nbsp;&mdash;&nbsp;
        <span>m</span> = month index (1 to 60)<br>
        Each entry pays back 10% of its price in 60 equal monthly instalments.
        Each instalment is discounted by <span>(1 + r)<sup>m</sup></span> to convert future cash to today&apos;s value.
        The 60 <code>pow()</code> calls per entry are what makes this GPU-worthy at 1&nbsp;000&nbsp;000 entries.
    </div>`;

function stringFormulaHTML(count: number): string {
    const bufMB = (count * STRING_STRIDE * 4 / 1024 / 1024).toFixed(1);
    return `
    <div class="formula-title">Calculation — GPU string processing: uppercase + append &ldquo; MODEL&rdquo;</div>
    <div class="formula-line">out[i] = toUpper(in[i]) + &quot; MODEL&quot;</div>
    <div class="formula-vars">
        Strings are encoded as <span>UTF-32</span> (one <code>u32</code> per code point, ${STRING_STRIDE} slots per string)
        and uploaded as a flat <code>Uint32Array</code> to a storage buffer.<br>
        Each GPU thread handles <span>one string</span>: it uppercases ASCII a&ndash;z and Latin-1 accented
        lowercase (à&ndash;ö, ø&ndash;þ) using a subtract-32 trick, then appends <span>&ldquo; MODEL&rdquo;</span>
        and a null terminator.<br>
        PCIe round-trip at ${count.toLocaleString('en-CA')} entries:
        <span>~${bufMB}&nbsp;MB</span> upload&nbsp;+&nbsp;readback.
        This calc demonstrates when <em>not</em> to use the GPU — JS is typically faster for short string work.
    </div>`;
}

// 5.5 % annual rate compounded monthly — fixed for this demo.
const FINANCING_RATE = 0.055;

function lowestFormulaHTML(rate: number, eurRate: number, years: number): string {
    const pct    = (rate * 100).toFixed(1);
    const months = years * 12;
    const factor = Math.pow(1 + FINANCING_RATE / 12, months).toFixed(4);
    return `
    <div class="formula-title">Calculation — Cheapest 5 after rebate + 5.5% financing, converted to EUR</div>
    <div class="formula-line">price<sub>EUR</sub> = P &times; (1 &minus; ${pct}%) &times; ${eurRate.toFixed(4)} &times; (1 + 0.055/12)<sup>${months}</sup></div>
    <div class="formula-vars">
        <span>P</span> = vehicle price (CAD) &nbsp;&mdash;&nbsp;
        rebate = <span>${pct}%</span> (random, fixed at page load) &nbsp;&mdash;&nbsp;
        CAD&rarr;EUR = <span>${eurRate.toFixed(4)}</span> (live rate)<br>
        Financing: <span>5.5% annual</span> compounded monthly over
        <span>${years}&nbsp;year${years > 1 ? 's' : ''}</span>
        &nbsp;&rarr;&nbsp; compound factor <span>${factor}</span>.<br>
        The GPU transforms all 10&nbsp;000 prices in a single dispatch.
        The CPU sorts in O(n&nbsp;log&nbsp;n) to find the 5 cheapest financed price in EUR.
    </div>`;
}

function graphFormulaHTML(count: number, type: 'bar' | 'line'): string {
    return `
    <div class="formula-title">Calculation — Average price (CAD) per nameplate, GPU render pipeline</div>
    <div class="formula-line">${type === 'bar' ? 'Bar chart' : 'Line chart'} &mdash; ${count.toLocaleString('en-CA')} rows &rarr; 20 averaged data points</div>
    <div class="formula-vars">
        Each of the <span>20</span> nameplates is averaged over its share of the
        <span>${count.toLocaleString('en-CA')}</span> generated rows (deterministic &plusmn;$5&nbsp;000 variation).<br>
        The GPU renders the result directly via a <span>render pipeline</span>
        (vertex&nbsp;+&nbsp;fragment shaders, no readback).<br>
        <span>vs_${type}</span>: instanced geometry — ${type === 'bar'
            ? '6&nbsp;vertices &times; 20 bar instances (two triangles per bar)'
            : '6&nbsp;vertices &times; 19 segment instances (perpendicular-offset quads)'}.
        Colour gradient: cyan (low) &rarr; warm (high).
    </div>`;
}

// ── Calc runners ───────────────────────────────────────────────────────────────
async function runNPV(compute: CalculatorCompute, count: number): Promise<void> {
    const { nameplates, prices } = generateMockData(count);

    setTableHeads('standard');
    setFormulaBlock(NPV_FORMULA_HTML);
    setRebateHeaders('NPV (CAD)');
    resolveTimingCard('timing-count', count.toLocaleString('en-CA'));
    pendingCard('timing-gpu');
    pendingCard('timing-js');

    // ── GPU ──
    const { rebates: gpuRebates, gpuTimeMs } = await compute.runNPV(prices);
    resolveTimingCard('timing-gpu', `${gpuTimeMs.toFixed(3)} ms`);
    populateTable({
        nameplates, prices, rebates: gpuRebates,
        displayCount: Math.min(DISPLAY_ROWS, count),
        totalCount: count,
        tbodyId: 'table-body-gpu',
        noteId: 'table-note-gpu',
    });

    // ── JS ── (skipped above NPV_JS_MAX — 60 pow() per entry would freeze the tab)
    if (count > NPV_JS_MAX) {
        const tbody  = document.getElementById('table-body-js')!;
        const noteEl = document.getElementById('table-note-js');
        tbody.innerHTML = '';
        if (noteEl) noteEl.textContent =
            `JS skipped — ${count.toLocaleString('en-CA')} × 60 pow() calls would freeze the tab.`;
        resolveTimingCard('timing-js', '—');
    } else {
        const MONTHS = 60;
        const MONTHLY_RATE = 0.05 / 12;
        const t0 = performance.now();
        const jsRebates = new Float32Array(prices.length);
        for (let i = 0; i < prices.length; i++) {
            const monthly = prices[i] * 0.1 / MONTHS;
            let npv = 0;
            for (let m = 0; m < MONTHS; m++) {
                npv += monthly / Math.pow(1.0 + MONTHLY_RATE, m + 1);
            }
            jsRebates[i] = npv;
        }
        resolveTimingCard('timing-js', `${(performance.now() - t0).toFixed(3)} ms`);
        populateTable({
            nameplates, prices, rebates: jsRebates,
            displayCount: Math.min(DISPLAY_ROWS, count),
            totalCount: count,
            tbodyId: 'table-body-js',
            noteId: 'table-note-js',
        });
    }
}

async function runLowest(compute: CalculatorCompute, cadToEur: number, years: number, count: number): Promise<void> {
    const { nameplates, prices } = generateMockData(count);
    const fmtEUR      = makeEurFormatter();
    const months      = years * 12;
    const monthlyRate = FINANCING_RATE / 12;
    const top         = Math.min(LOWEST_TOP, count);

    setTableHeads('standard');
    setFormulaBlock(lowestFormulaHTML(REBATE_RATE, cadToEur, years));
    setRebateHeaders('Financed Price (EUR)');
    resolveTimingCard('timing-count', count.toLocaleString('en-CA'));
    pendingCard('timing-gpu');
    pendingCard('timing-js');

    // ── GPU ──
    const { eurPrices: gpuEurPrices, gpuTimeMs } = await compute.runLowest(prices, REBATE_RATE, cadToEur, months);
    resolveTimingCard('timing-gpu', `${gpuTimeMs.toFixed(3)} ms`);
    populateTable({
        nameplates, prices, rebates: gpuEurPrices,
        displayCount: top,
        totalCount: count,
        tbodyId: 'table-body-gpu',
        noteId: 'table-note-gpu',
        rowIndices: topNIndices(gpuEurPrices, top),
        formatRebate: fmtEUR,
    });

    // ── JS ──
    const compoundFactor = Math.pow(1 + monthlyRate, months);
    const t0 = performance.now();
    const jsEurPrices = new Float32Array(prices.length);
    for (let i = 0; i < prices.length; i++) {
        jsEurPrices[i] = prices[i] * (1 - REBATE_RATE) * cadToEur * compoundFactor;
    }
    const jsTop = topNIndices(jsEurPrices, top);
    resolveTimingCard('timing-js', `${(performance.now() - t0).toFixed(3)} ms`);
    populateTable({
        nameplates, prices, rebates: jsEurPrices,
        displayCount: top,
        totalCount: count,
        tbodyId: 'table-body-js',
        noteId: 'table-note-js',
        rowIndices: jsTop,
        formatRebate: fmtEUR,
    });
}

async function runString(compute: CalculatorCompute, count: number): Promise<void> {
    const { nameplates } = generateMockData(count);

    setTableHeads('string');
    setFormulaBlock(stringFormulaHTML(count));
    resolveTimingCard('timing-count', count.toLocaleString('en-CA'));
    pendingCard('timing-gpu');
    pendingCard('timing-js');

    // ── GPU (capped at STRING_GPU_MAX — larger buffers exceed ~384 MB) ──
    if (count > STRING_GPU_MAX) {
        const tbody  = document.getElementById('table-body-gpu')!;
        const noteEl = document.getElementById('table-note-gpu');
        tbody.innerHTML = '';
        if (noteEl) noteEl.textContent =
            `GPU skipped — ${count.toLocaleString('en-CA')} × ${STRING_STRIDE * 4} B/entry exceeds safe buffer limits.`;
        resolveTimingCard('timing-gpu', '—');
    } else {
        const charBuf = encodeStrings(nameplates);
        const { processedChars, gpuTimeMs } = await compute.runString(charBuf);
        resolveTimingCard('timing-gpu', `${gpuTimeMs.toFixed(3)} ms`);
        const gpuStrings = Array.from({ length: count }, (_, i) => decodeString(processedChars, i));
        populateStringTable({
            originals: nameplates,
            processed: gpuStrings,
            displayCount: Math.min(DISPLAY_ROWS, count),
            totalCount: count,
            tbodyId: 'table-body-gpu',
            noteId: 'table-note-gpu',
        });
    }

    // ── JS ── (no buffer limit — toUpperCase is fast even at 10 M)
    const t0 = performance.now();
    const jsStrings = nameplates.map((s: string) => s.toUpperCase() + ' MODEL');
    resolveTimingCard('timing-js', `${(performance.now() - t0).toFixed(3)} ms`);
    populateStringTable({
        originals: nameplates,
        processed: jsStrings,
        displayCount: Math.min(DISPLAY_ROWS, count),
        totalCount: count,
        tbodyId: 'table-body-js',
        noteId: 'table-note-js',
    });
}

// ── Graph show/hide ────────────────────────────────────────────────────────────
const graphCanvas      = document.getElementById('graph-canvas')      as HTMLCanvasElement;
const graphLabels      = document.getElementById('graph-labels')      as HTMLElement;
const jsColumn         = document.getElementById('js-column')         as HTMLElement;
const gpuTable         = graphCanvas.nextElementSibling               as HTMLElement; // <table>
const gpuTableNote     = document.getElementById('table-note-gpu')    as HTMLElement;
const countRow         = document.getElementById('count-row')         as HTMLElement;
const graphPointsRow   = document.getElementById('graph-points-row')  as HTMLElement;
const graphTypeRow     = document.getElementById('graph-type-row')    as HTMLElement;
const timingEurCard    = document.getElementById('timing-eur')!.closest<HTMLElement>('.timing-card')!;

function showGraphMode(visible: boolean): void {
    graphCanvas.style.display    = visible ? 'block' : 'none';
    graphLabels.style.display    = visible ? 'flex'  : 'none';
    gpuTable.style.display       = visible ? 'none'  : '';
    gpuTableNote.style.display   = visible ? 'none'  : '';
    jsColumn.style.display       = visible ? 'none'  : '';
    countRow.style.display       = visible ? 'none'  : 'flex';
    graphPointsRow.style.display = visible ? 'flex'  : 'none';
    graphTypeRow.style.display   = visible ? 'flex'  : 'none';
    timingEurCard.style.display  = visible ? 'none'  : '';
}

async function runGraph(renderer: GraphRenderer, count: number, type: 'bar' | 'line'): Promise<void> {
    // JS generates the raw price rows; GPU will compute the per-nameplate averages.
    const { prices: rawPrices, graphData } = generateMockData(count);

    // Use JS-side averages only to derive display bounds — GPU recomputes the averages.
    const jsVals = graphData.map(p => p.value);
    const lo   = Math.min(...jsVals);
    const hi   = Math.max(...jsVals);
    const pad  = (hi - lo) * 0.08;
    const minVal = lo - pad;
    const maxVal = hi + pad;

    setFormulaBlock(graphFormulaHTML(count, type));
    resolveTimingCard('timing-count', count.toLocaleString('en-CA'));
    pendingCard('timing-gpu');

    showGraphMode(true);

    // Populate nameplate labels — one per bar/point, aligned via equal flex slots.
    graphLabels.innerHTML = graphData
        .map(p => `<div><span title="${p.label}">${p.label}</span></div>`)
        .join('');

    // Size the canvas to its CSS layout dimensions × device pixel ratio for crispness.
    graphCanvas.width  = graphCanvas.clientWidth  * devicePixelRatio;
    graphCanvas.height = graphCanvas.clientHeight * devicePixelRatio;

    const { gpuTimeMs } = await renderer.render(rawPrices, type, minVal, maxVal);
    resolveTimingCard('timing-gpu', `${gpuTimeMs.toFixed(3)} ms`);
}

// ── Entry point ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    if (!navigator.gpu) {
        document.body.insertAdjacentHTML(
            'afterbegin',
            '<p style="color:#f66;padding:16px;font-family:monospace">WebGPU is not supported in this browser.</p>',
        );
        return;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter found.');
    const device  = await adapter.requestDevice();
    const compute = new CalculatorCompute(device);
    let graphRenderer: GraphRenderer | null = null;

    // Fetch live CAD→EUR rate, fall back to hardcoded if unavailable.
    let cadToEur = EUR_FALLBACK;
    try {
        const resp = await fetch('https://open.er-api.com/v6/latest/CAD');
        const json = await resp.json();
        cadToEur = json.rates?.EUR ?? EUR_FALLBACK;
    } catch { /* use fallback silently */ }
    resolveTimingCard('timing-eur', `1 CAD = ${cadToEur.toFixed(4)} EUR`);

    // Wire up calc switcher.
    const select            = document.getElementById('calc-select')         as HTMLSelectElement;
    const yearsSelect       = document.getElementById('years-select')        as HTMLSelectElement;
    const yearsRow          = document.getElementById('years-row')           as HTMLElement;
    const countSelect       = document.getElementById('count-select')        as HTMLSelectElement;
    const graphPointsSelect = document.getElementById('graph-points-select') as HTMLSelectElement;
    const graphTypeSelect   = document.getElementById('graph-type-select')   as HTMLSelectElement;

    function getYears(): number       { return parseInt(yearsSelect.value, 10); }
    function getCount(): number       { return parseInt(countSelect.value, 10); }
    function getGraphCount(): number  { return parseInt(graphPointsSelect.value, 10); }
    function getGraphType(): 'bar' | 'line' { return graphTypeSelect.value as 'bar' | 'line'; }

    function showYearsRow(visible: boolean): void {
        yearsRow.style.display = visible ? 'flex' : 'none';
    }

    function rerunCurrent(): void {
        const isLowest = select.value === 'lowest';
        const isGraph  = select.value === 'graph';
        showYearsRow(isLowest);
        if (isGraph) {
            if (!graphRenderer) graphRenderer = new GraphRenderer(device, graphCanvas);
            runGraph(graphRenderer, getGraphCount(), getGraphType()).catch(console.error);
        } else {
            showGraphMode(false);
            if (select.value === 'npv') {
                runNPV(compute, getCount()).catch(console.error);
            } else if (isLowest) {
                runLowest(compute, cadToEur, getYears(), getCount()).catch(console.error);
            } else {
                runString(compute, getCount()).catch(console.error);
            }
        }
    }

    select.addEventListener('change', rerunCurrent);
    countSelect.addEventListener('change', rerunCurrent);
    graphPointsSelect.addEventListener('change', rerunCurrent);
    graphTypeSelect.addEventListener('change', rerunCurrent);
    yearsSelect.addEventListener('change', () => {
        if (select.value === 'lowest') {
            runLowest(compute, cadToEur, getYears(), getCount()).catch(console.error);
        }
    });

    // Run default calc on load.
    await runNPV(compute, getCount());
}

main().catch(console.error);
