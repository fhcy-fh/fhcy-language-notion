export class ApiResult<T = unknown> {
  code: number
  success: boolean
  message?: string
  data?: T

  constructor(code: number, success: boolean, data?: T, message?: string) {
    this.code = code
    this.success = success
    this.data = data
    this.message = message
  }

  static success<T>(data?: T, message = 'success'): ApiResult<T> {
    return new ApiResult(200, true, data, message)
  }

  static fail(message = 'error', code = 500): ApiResult<null> {
    return new ApiResult(code, false, null, message)
  }
}
export interface BaseInfoType {
  title: string
  description: string
  icon: string
}
