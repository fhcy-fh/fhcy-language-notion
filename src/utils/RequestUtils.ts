import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { ApiResult } from '@/src/types/CommonTypes'
import { toast } from '@heroui/react'

class RequestUtils {
  private static instance: AxiosInstance

  /**
   * 初始化 axios 实例
   */
  private static getInstance(): AxiosInstance {
    if (!this.instance) {
      const isServer = typeof window === 'undefined'
      let baseUrl = ''

      if (isServer) {
        // 服务端环境：必须使用绝对路径。优先读取环境变量，本地开发兜底 localhost:3000
        baseUrl =
          process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000'
      } else {
        // 客户端环境：留空或者用相对路径即可，浏览器会自动补全
        baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
      }

      this.instance = axios.create({
        baseURL: '',
        timeout: 600000,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // 请求拦截器
      this.instance.interceptors.request.use(
        (config) => {
          // 可以加 token
          // config.headers.Authorization = `Bearer ${token}`;
          return config
        },
        (error) => {
          return Promise.reject(error)
        },
      )

      // 响应拦截器
      this.instance.interceptors.response.use(
        (response: AxiosResponse) => {
          // 🌟 核心拦截点：HTTP Status 是 200，但需要检查内部业务 code
          const bizData = response.data // 此时的数据结构通常是 ApiResult

          if (bizData && typeof bizData === 'object' && 'code' in bizData) {
            // 如果业务 code 明确不是 200（比如 500 或者是 403 等）
            if (bizData.code !== 200) {
              const errorMsg = bizData.msg || bizData.message || '业务执行异常'

              // 🌟 唤起 HeroUI 3.2 的全局 Toast 轻提示
              toast.danger(errorMsg)

              // 抛出错误，阻止前端页面在 `await RequestUtils.post` 后继续走成功逻辑
              return Promise.reject(new Error(errorMsg))
            }
          }
          return response
        },
        (error) => {
          const message =
            error?.response?.data?.message ||
            error.message ||
            'Operation failed'

          console.log(message)
          return Promise.reject(new Error(message))
        },
      )
    }

    return this.instance
  }

  /**
   * GET 请求
   */
  static async get<ApiResult>(
    url: string,
    params?: Record<string, any>,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult> {
    const res = await this.getInstance().get(url, {
      params,
      ...config,
    })

    return res.data
  }

  /**
   * POST 请求
   */
  static async post<ApiResult>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult> {
    const res = await this.getInstance().post(url, data, config)
    return res.data
  }

  /**
   * PUT 请求
   */
  static async put<ApiResult>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult> {
    const res = await this.getInstance().put(url, data, config)
    return res.data
  }

  /**
   * DELETE 请求
   */
  static async delete<ApiResult>(
    url: string,
    params?: any,
    config?: AxiosRequestConfig,
  ): Promise<ApiResult> {
    const res = await this.getInstance().delete(url, {
      params,
      ...config,
    })

    return res.data
  }
}

export default RequestUtils
