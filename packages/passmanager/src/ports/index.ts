export type {PasswordsRepository} from './passwords-repository'
export type {OTPSecretsGateway} from './otp-secrets-gateway'

// Минимальный контракт CatalogService, который нужен PassManager
// Не тянем зависимости из apps; этот тип будет расширяться по мере миграции
export type CatalogClientProtocolLike = unknown

export type CatalogSecretsLike = {
  read: (nodeId: number) => Promise<ArrayBuffer | undefined>
  write: (nodeId: number, data: ArrayBuffer) => Promise<void>
  erase: (nodeId: number) => Promise<void>
  generateOTP: (params: {
    nodeId: number
    ts?: number
    digits?: number
    period?: number
    ha?: string
    label?: string
  }) => Promise<string | undefined>
  setOTP: (params: {
    nodeId: number
    label: string
    secret: string
    encoding: 'base32' | 'base64' | 'hex'
    algorithm: string
    digits: number
    period: number
  }) => Promise<void>
  removeOTP: (params: {nodeId: number; label: string}) => Promise<void>
}

export type CatalogServiceLike = {
  api: CatalogClientProtocolLike
  secrets: CatalogSecretsLike
}

export type PassManagerDeps = {
  catalog: CatalogServiceLike
}
