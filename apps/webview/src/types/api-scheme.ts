import type {FullChromVoidState} from '@chromvoid/scheme'

type RData = Record<string, unknown> | Blob | unknown
type Route<Req extends RData, Res extends RData> = {
  response: Res
  request: Req
}
type NullObject = Record<never, unknown>

type ResponseResult<T = Record<string, unknown>> = {result: boolean; error?: string; error_code?: number} & T

export type ExtDrive = {
  Model: string
  Size: string
  Partitions: Array<{
    Device: string
    Size: string
    Type: string
  }>
}
export type ExtStorage = {
  FreeSpaceMB: string
  Path: string
}
type StoreSession = {'stor-session': string}

export type OTPAlgo = {
  ha: string
  period: number
  digits: number
}

export type SaveOTPRequset = {
  key: string
  seckey: string
}

export type ApiRouter = {
  'api.state': Route<NullObject, FullChromVoidState>

  /**
   * тоже не особо знаю зачем
   */
  'api.serialnum': Route<NullObject, NullObject>

  /**
   * параметры pwd - пароль и storepath - путь к хранилищу,
   * если пустой, то значит внутреннее хранилище
   *
   * METHOD: POST
   */
  'api.unlockstorage': Route<{pwd: string; storepath: string; onpoweron?: 1}, ResponseResult<StoreSession>>

  /**
   * блокирует хранилище и вырубает девайс (потом может сделаем чтоб не вырубал, но пока вырубает)
   */
  'api.lockstorage': Route<NullObject, ResponseResult<NullObject>>

  /**
   * это для oem инициализации
   */
  'api.savelicense': Route<NullObject, NullObject>

  /**
   * тут параметр step=1 или 2, выше описал уже логику зачем
   */
  'api.userinit': Route<{step: '1' | '2'; masterpwd?: string}, ResponseResult<NullObject>>

  /**
   * Показывает список подключенных внешних дисков
   * (можешь подрубить ssd ко второму usb порту и посмотреть)
   */
  'api.extdriveslist': Route<NullObject, ResponseResult<{extdrives: Record<string, ExtDrive>}>>

  /**
   * примонтировать внешний диск (не знаю пока нафиг оно отдельно, но может понадобится)
   * параметр extdrive имя диска из extdriveslist
   */
  'api.extmount': Route<{extdrive: string}, NullObject>

  /**
   * соответственно отмонтировать параметр такой же как у extmount
   */
  'api.extumount': Route<{extdrive: string}, NullObject>

  /**
   * отмонтировать все внешние диски, без параметров
   */
  'api.extumountall': Route<NullObject, NullObject>

  /**
   * Инициализировать новое хранилище на внешнем диске,
   * параметры extdrive и folder, при этом folder это от корня диска
   */
  'api.extinitstorage': Route<{extdrive: string; folder: string}, ResponseResult>

  /**
   * показывает список внешних хранилищ,
   * Path из ответа надо использовать как параметр в storepath в api.unlockstorage
   */
  'api.extstorageslist': Route<NullObject, ResponseResult<{storages: ExtStorage[]}>>

  'api.changemasterpwd': Route<{oldpwd: string; newpwd: string}, ResponseResult>
  'api.erasedevice': Route<{masterpwd: string}, ResponseResult>
  'api.backupdevice': Route<{masterpwd: string; extdrive: string; folder: string}, ResponseResult>
  'api.restoredevice': Route<{masterpwd: string; extdrive: string; folder: string}, ResponseResult>
  'api.read': Route<{key: string}, unknown>
  'api.remove': Route<{key: string}, ResponseResult<boolean>>
  'api.write': Route<{key: string; value: File}, ResponseResult>
  'api.saveotp': Route<SaveOTPRequset, ResponseResult>
  'api.removeotp': Route<{key: string}, ResponseResult>
  'api.getotp': Route<{ts: number; key: string} & OTPAlgo, ResponseResult<{otp: string}>>
  'api.getotpseckey': Route<{key: string}, ResponseResult<{seckey: string}>>

  'api.setipandhostname': Route<{masterpwd: string; ip: string; hostname: string}, ResponseResult>
  'api.start': Route<{}, ResponseResult<{'stor-session': string}>>
  'api.checksession': Route<StoreSession, ResponseResult>
}

export type ApiRoutes = keyof ApiRouter
