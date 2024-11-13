@group(0) @binding(0)  var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<u32>;

struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
}

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let i = f32(input.instance);
    // Compute the cell coordinates from the instance index.
    let cell = vec2f(i % grid[0], floor(i / grid[1]));
    // Get the state of the cell.
    let state = f32(cellState[input.instance]);

    // Canvas is [-1, 1] so we need to scale the grid to fit.
    let cellOffset = cell / grid * 2;
    let gridPos = (input.pos * state + 1) / grid - 1 + cellOffset;
    return VertexOutput(
        vec4f(gridPos, 0, 1),
        cell,
    );
}

struct FragmentInput {
    @location(0) cell: vec2f,
}

@fragment
fn fragmentMain(
    input: FragmentInput,
) -> @location(0) vec4f {
    let c = input.cell / grid;
    return vec4f(c, 1 - c.y, 1.0);
}
