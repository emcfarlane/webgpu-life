var g=`@group(0) @binding(0)  var<uniform> grid: vec2f;
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
`;var p=`@group(0) @binding(0) var<uniform> grid: vec2f;

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
`;var t=32,w=200,c=0,C=8,y=document.querySelector("canvas");if(!y)throw new Error("No canvas found.");if(!navigator.gpu)throw new Error("WebGPU not supported on this browser.");console.log("WebGPU is supported!");var m=await navigator.gpu.requestAdapter();if(!m)throw new Error("No appropriate GPUAdapter found.");var e=await m.requestDevice(),o=y.getContext("webgpu");if(!o)throw new Error("No context found.");var x=navigator.gpu.getPreferredCanvasFormat();o.configure({device:e,format:x});var f=new Float32Array([-.8,-.8,.8,-.8,.8,.8,-.8,-.8,-.8,.8,.8,.8]),P=e.createBuffer({label:"Cell vertices",size:f.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(P,0,f);var B={arrayStride:8,attributes:[{format:"float32x2",offset:0,shaderLocation:0}]},S=new Float32Array([t,t]),u=e.createBuffer({label:"Grid uniforms",size:S.byteLength,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});e.queue.writeBuffer(u,0,S);var n=new Uint32Array(t*t),l=[e.createBuffer({label:"Cell state A",size:n.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),e.createBuffer({label:"Cell state B",size:n.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST})];for(let r=0;r<t*t;r+=3)n[r]=Math.random()>.6?1:0;e.queue.writeBuffer(l[0],0,n);e.queue.writeBuffer(l[1],0,n);var b=e.createShaderModule({label:"Cell shader",code:g}),s=e.createBindGroupLayout({label:"Cell bind group layout",entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT|GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}}]}),v=[e.createBindGroup({label:"Cell render bind group A",layout:s,entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:l[0]}},{binding:2,resource:{buffer:l[1]}}]}),e.createBindGroup({label:"Cell render bind group B",layout:s,entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:l[1]}},{binding:2,resource:{buffer:l[0]}}]})],h=e.createPipelineLayout({label:"Simulation pipeline layout",bindGroupLayouts:[s]}),O=e.createRenderPipeline({label:"Cell pipeline",layout:h,vertex:{module:b,entryPoint:"vertexMain",buffers:[B]},fragment:{module:b,entryPoint:"fragmentMain",targets:[{format:x}]}}),A=e.createShaderModule({label:"Game  of Life simulation shader",code:p}),E=e.createComputePipeline({label:"Simulation pipeline",layout:h,compute:{module:A,entryPoint:"computeMain"}});function I(){if(!o)throw new Error("No context found.");let r=e.createCommandEncoder(),a=r.beginComputePass();a.setPipeline(E),a.setBindGroup(0,v[c%2]);let d=Math.ceil(t/C);a.dispatchWorkgroups(d,d,1),a.end(),c++;let i=r.beginRenderPass({label:"Cell render pass",colorAttachments:[{view:o.getCurrentTexture().createView(),loadOp:"clear",storeOp:"store",clearValue:{r:.11,g:.11,b:.12,a:1}}]});i.setPipeline(O),i.setVertexBuffer(0,P),i.setBindGroup(0,v[c%2]),i.draw(f.length/2,t*t),i.end(),e.queue.submit([r.finish()])}setInterval(I,w);
//# sourceMappingURL=life.js.map
