// Match Config::getGPUs: saved selection alone does not make a GPU usable.
export function activeGPUIds(group, detected = {}) {
  return Object.keys(group.gpus || {}).filter(id => {
    const gpu = detected[id]
    return group.gpus[id]?.enabled && gpu?.supported === true &&
      ((gpu.cuda && group.cuda !== false) ||
       (gpu.hip && group.hip !== false) ||
       (gpu.opencl && group.opencl !== false))
  }).sort()
}
