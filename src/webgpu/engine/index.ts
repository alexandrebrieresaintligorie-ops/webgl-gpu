export { Engine } from './Engine'
export { Camera } from './core/Camera'

// GameObject (sole user-facing entity)
export { GameObject } from './gameObject/GameObject'
export type { IGameObject } from './gameObject/GameObject'

// Option types for Engine.create*() methods
export type {
  EngineOptions,
  CameraOptions,
  BindGroupLayouts,
  GameObjectBaseOptions,
  MeshOptions,
  MeshGameObjectOptions,
  ComputedMeshOptions,
  ComputedMeshGameObjectOptions,
  Quad2DOptions,
  Quad2DGameObjectOptions,
  Quad3DOptions,
  Quad3DGameObjectOptions,
  ModelAssetHandle,
  Model3DOptions,
  Model3DGameObjectOptions,
  FbxAssetHandle,
  FbxModelOptions,
  FbxModelGameObjectOptions,
} from './types'
