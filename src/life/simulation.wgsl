@group(0) @binding(0) var<uniform> grid: vec2f;

@group(0) @binding(1) var<storage> cellStateIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

fn cellIndex(cell: vec2u) -> u32 {
    // Supports grid wrapping.
    return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
}

fn cellActive(x: u32, y: u32) -> u32 {
    return cellStateIn[cellIndex(vec2(x, y))];
}

@compute
@workgroup_size(8, 8) // TODO: Use templates for WORKGROUP_SIZE?
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
    var x: u32 = 0;
    x += cellActive(cell.x + 1, cell.y + 1);
    x += cellActive(cell.x + 1, cell.y);
    x += cellActive(cell.x + 1, cell.y - 1);
    x += cellActive(cell.x, cell.y - 1);
    x += cellActive(cell.x - 1, cell.y - 1);
    x += cellActive(cell.x - 1, cell.y);
    x += cellActive(cell.x - 1, cell.y + 1);
    x += cellActive(cell.x, cell.y + 1);

    let i = cellIndex(cell.xy); // Called swizzling cell.xy == vec2(cell.x, cell.y)

    // Conway's game of life rules:
    switch x {
        case 2: { // Active cells with 2 neighbors stay active.
            cellStateOut[i] = cellStateIn[i];
        }
        case 3: { // Cells with 3 neighbors become or stay active.
            cellStateOut[i] = 1;
        }
        default: { // Cells with < 2 or > 3 neighbors become inactive.
            cellStateOut[i] = 0;
        }
    }
}
