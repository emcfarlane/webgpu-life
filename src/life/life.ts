// WebGPU life game example.
//
const GRID_SIZE = 32;
const UPDATE_INTERVAL = 200; // 5 FPS
let step = 0; // Track how many simulation steps have been run
const WORKGROUP_SIZE = 8;

import CellShader from "./cell.wgsl";
import SimulationShader from "./simulation.wgsl";

const canvas = document.querySelector("canvas");
if (!canvas) {
  throw new Error("No canvas found.");
}

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}
console.log("WebGPU is supported!");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");
if (!context) {
  throw new Error("No context found.");
}

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

const vertices = new Float32Array([
  // X,  Y,
  -0.8, -0.8, // Triangle 1
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8, // Triangle 2 
  -0.8, 0.8,
  0.8, 0.8,
]);

const vertexBuffer = device.createBuffer({
  // Labels are useful for debugging.
  label: "Cell vertices",
  // 4 bytes * 12 vertices = 48 bytes.
  size: vertices.byteLength,
  // The buffer will be used as the source of vertex data.
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, /* offset */ 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
  // 2 floats for position.
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0, // Position, see vertex shader
  }],
};

// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// Create an array represnting the active state of each cell.
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
// Create a buffer to store the cell state.
const cellStateStorage: Array<GPUBuffer> = [
  device.createBuffer({
    label: "Cell state A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell state B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
];
// Initialize the cell state.
for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 3) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);


const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: CellShader,
});

// Create a bind group layout.
// We cannot use the pipeline layout because the compute shader needs a
// different bind group layout. "auto" doesn't know about the compute shader.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell bind group layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
    buffer: { type: "uniform" },
  }, {
    binding: 1,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" },
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage" },
  }],
});

const bindGroups = [
  device.createBindGroup({
    label: "Cell render bind group A",
    layout: bindGroupLayout, // Corresponds to @group(0) in the shader.
    entries: [{
      binding: 0, // Corresponds to @binding(0) in the shader.
      resource: { buffer: uniformBuffer },
    }, {
      binding: 1, // Corresponds to @binding(1) in the shader.
      resource: { buffer: cellStateStorage[0] },
    }, {
      binding: 2, // Corresponds to @binding(2) in the shader.
      resource: { buffer: cellStateStorage[1] },
    }],
  }),
  device.createBindGroup({
    label: "Cell render bind group B",
    // The layout is derived from the `layout: "auto"` in the pipeline.
    layout: bindGroupLayout, // Corresponds to @group(0) in the shader.
    entries: [{
      binding: 0, // Corresponds to @binding(0) in the shader.
      resource: { buffer: uniformBuffer },
    }, {
      binding: 1, // Corresponds to @binding(1) in the shader.
      resource: { buffer: cellStateStorage[1] },
    }, {
      binding: 2, // Corresponds to @binding(2) in the shader.
      resource: { buffer: cellStateStorage[0] },
    }],
  }),
];

const pipelineLayout = device.createPipelineLayout({
  label: "Simulation pipeline layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout, // Can't use "auto".
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat,
    }],
  },
});

const simulationShaderModule = device.createShaderModule({
  label: "Game  of Life simulation shader",
  code: SimulationShader,
});

const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  },
})


function updateGrid() {
  if (!context) {
    throw new Error("No context found.");
  }

  const encoder = device.createCommandEncoder();

  // Start a compute pass.
  const computePass = encoder.beginComputePass();
  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]); // Corresponds to @group(0) in the shader.
  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount, 1);

  computePass.end();

  step++;

  // Start a render pass.
  const pass = encoder.beginRenderPass({
    label: "Cell render pass",
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      storeOp: "store",
      clearValue: { r: 0.11, g: 0.11, b: 0.12, a: 1.0 }, // Can pass as an array as well.
    }],
  });

  // Create the grid.
  pass.setPipeline(cellPipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setBindGroup(0, bindGroups[step % 2]); // Corresponds to @group(0) in the shader.
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // Instance count is the number of squares.

  pass.end();
  // Finish the command buffer and immediately submit it.
  device.queue.submit([encoder.finish()]);
}

// Schedule updateGrid to run repeatedly.
setInterval(updateGrid, UPDATE_INTERVAL);
