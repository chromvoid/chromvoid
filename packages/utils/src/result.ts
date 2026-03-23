export class Result<TRes, TErr> {
  value: TRes | undefined
  error: TErr | undefined
  ok: boolean
  constructor(data: {ok: boolean; value?: TRes; error?: TErr} | Result<TRes, TErr>) {
    this.value = data.value
    this.error = data.error
    this.ok = data.ok
  }
  static success<T, E>(value: T) {
    return new Result<T, E>({ok: true, value})
  }
  static failure<E, T>(error: E) {
    return new Result<T, E>({ok: false, error})
  }
  pipeSuccess<T extends (value: TRes) => Result<unknown, unknown>>(fn: T) {
    if (this.value) {
      return fn(this.value)
    }
    return this
  }
  pipeError<E extends (value: TErr) => Result<unknown, unknown>>(fn: E) {
    if (this.error) {
      return fn(this.error)
    }
    return this
  }
}
