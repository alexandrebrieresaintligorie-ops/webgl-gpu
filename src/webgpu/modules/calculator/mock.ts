// 20 real-ish Canadian-market performance car nameplates with approximate MSRP.
const NAMEPLATES = [
    'Ford Mustang GT',
    'Chevrolet Corvette Z06',
    'Dodge Challenger R/T',
    'Toyota GR Supra',
    'Honda Civic Type R',
    'Subaru WRX STI',
    'BMW M3 Competition',
    'Audi RS3 Sportback',
    'Mercedes-AMG C63',
    'Porsche 718 Cayman',
    'Volkswagen Golf R',
    'Hyundai Elantra N',
    'Kia Stinger GT',
    'Mazda MX-5 Miata RF',
    'Nissan Z Performance',
    'Alfa Romeo Giulia QV',
    'Lamborghini Huracán EVO',
    'Ferrari Roma Spider',
    'McLaren Artura',
    'Lotus Emira V6',
] as const;

const BASE_PRICES: Record<string, number> = {
    'Ford Mustang GT': 42_000,
    'Chevrolet Corvette Z06': 89_000,
    'Dodge Challenger R/T': 38_000,
    'Toyota GR Supra': 56_000,
    'Honda Civic Type R': 45_000,
    'Subaru WRX STI': 40_000,
    'BMW M3 Competition': 92_000,
    'Audi RS3 Sportback': 73_000,
    'Mercedes-AMG C63': 110_000,
    'Porsche 718 Cayman': 88_000,
    'Volkswagen Golf R': 47_000,
    'Hyundai Elantra N': 34_000,
    'Kia Stinger GT': 52_000,
    'Mazda MX-5 Miata RF': 38_000,
    'Nissan Z Performance': 48_000,
    'Alfa Romeo Giulia QV': 95_000,
    'Lamborghini Huracán EVO': 275_000,
    'Ferrari Roma Spider': 320_000,
    'McLaren Artura': 290_000,
    'Lotus Emira V6': 85_000,
};

export interface GraphPoint {
    label: string;
    value: number;
}

export interface MockData {
    nameplates: string[];
    prices: Float32Array<ArrayBuffer>;
    graphData: GraphPoint[];
}

// NPV calc: 1 M entries — arithmetic-heavy enough to offset PCIe round-trip.
export const NPV_ENTRIES = 1_000_000;
// Lowest calc: 10 K entries — small dataset, single-pass transform then CPU sort.
export const LOWEST_ENTRIES = 10_000;

export function generateMockData(count: number): MockData {
    const nameplates: string[] = new Array(count);
    const prices = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        const name = NAMEPLATES[i % NAMEPLATES.length];
        // Deterministic pseudo-random variation of ±$5 000 so every row differs.
        const delta = ((i * 137 + 31) % 10_001) - 5_000;
        nameplates[i] = name;
        prices[i] = BASE_PRICES[name] + delta;
    }

    const totals = new Float64Array(NAMEPLATES.length);
    const counts = new Uint32Array(NAMEPLATES.length);
    for (let i = 0; i < count; i++) {
        const idx = i % NAMEPLATES.length;
        totals[idx] += prices[i];
        counts[idx]++;
    }
    const graphData: GraphPoint[] = NAMEPLATES.map((label, idx) => ({
        label,
        value: counts[idx] > 0 ? totals[idx] / counts[idx] : BASE_PRICES[label],
    }));

    return { nameplates, prices, graphData };
}
