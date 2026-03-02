#!/usr/bin/env bash
set -euo pipefail

# Converts a .wgsl shader file into a TypeScript module that exports the shader
# source as a tagged template literal, plus any top-level WGSL const declarations
# as separate named exports (prefixed with the filename stem).
#
# Usage: ./wgsl-to-ts.sh path/to/myShader.wgsl
# Output: path/to/myShader.ts

# --- argument validation ---
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <shader.wgsl>" >&2
    exit 1
fi

INPUT="$1"

if [[ ! -f "$INPUT" ]]; then
    echo "Error: file not found: $INPUT" >&2
    exit 1
fi

if [[ "$INPUT" != *.wgsl ]]; then
    echo "Error: expected a .wgsl file" >&2
    exit 1
fi

# --- derive constant names ---
STEM=$(basename "$INPUT" .wgsl)
DIR=$(dirname "$INPUT")
OUTPUT="$DIR/$STEM.ts"

# Full stem → UPPER_SNAKE_CASE  (used for the main shader export)
# e.g. myVertexShader → MY_VERTEX_SHADER
MAIN_CONST=$(echo "$STEM" \
    | sed -E 's/([A-Z])/_\1/g' \
    | tr '[:lower:]' '[:upper:]' \
    | sed -E 's/^_//')

# Strip trailing "Shader" / "shader" from stem, then UPPER_SNAKE_CASE
# → used as prefix for top-level WGSL const exports
# e.g. myVertexShader → MY_VERTEX,  terrain → TERRAIN
PREFIX_STEM=$(echo "$STEM" | sed -E 's/[Ss]hader$//')
PREFIX=$(echo "$PREFIX_STEM" \
    | sed -E 's/([A-Z])/_\1/g' \
    | tr '[:lower:]' '[:upper:]' \
    | sed -E 's/^_//; s/_$//')

# --- extract top-level WGSL const declarations ---
# Scan lines until the first "structural" declaration (struct / @ / fn / var< / alias).
# Blank lines and // comments are skipped but do not stop the scan.
# Each matched line has the form:  const NAME : TYPE = VALUE ;
SEEN_STRUCTURAL=false
CONST_LINES=()

while IFS= read -r line; do
    # Strip leading whitespace for matching
    trimmed="${line#"${line%%[![:space:]]*}"}"

    # Skip blank lines and single-line comments
    [[ -z "$trimmed" ]] && continue
    [[ "$trimmed" == //* ]] && continue

    if [[ "$SEEN_STRUCTURAL" == false && "$trimmed" =~ ^const[[:space:]] ]]; then
        CONST_LINES+=("$trimmed")
    elif [[ "$trimmed" =~ ^(struct|@|fn[[:space:]]|var\<|alias) ]]; then
        SEEN_STRUCTURAL=true
    fi
done < "$INPUT"

# --- convert WGSL const lines to TypeScript export statements ---
# Strips WGSL type annotation and numeric suffixes (u / f / i after a digit).
# e.g.  const STRIDE: u32 = 32u;          → export const PREFIX_STRIDE = 32;
#       const RATE: f32 = 0.05f / 12.0f;  → export const PREFIX_RATE = 0.05 / 12.0;
CONST_EXPORTS=""
for cl in "${CONST_LINES[@]+"${CONST_LINES[@]}"}"; do
    # Name: word immediately after "const " (stops at colon, space, or =)
    cname=$(echo "$cl" | sed -E 's/^const[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\1/')

    # Value: everything between "= " and the final ";"
    cval=$(echo "$cl" | sed -E 's/.*=[[:space:]]*(.*);[[:space:]]*/\1/')

    # Strip WGSL numeric type suffixes (digit followed by u / f / i, not part of a word)
    cval=$(echo "$cval" | sed -E 's/([0-9])[ufi]([^a-zA-Z_]|$)/\1\2/g')

    CONST_EXPORTS+="export const ${PREFIX}_${cname} = ${cval};"$'\n'
done

# --- write the output .ts file ---
{
    if [[ -n "$CONST_EXPORTS" ]]; then
        printf '%s\n' "$CONST_EXPORTS"
    fi
    printf 'export const %s = /* wgsl */`\n' "$MAIN_CONST"
    cat "$INPUT"
    printf '\`;\n'
} > "$OUTPUT"

echo "Written: $OUTPUT"
if [[ -n "$CONST_EXPORTS" ]]; then
    echo "Exported consts:"
    echo "$CONST_EXPORTS"
fi
