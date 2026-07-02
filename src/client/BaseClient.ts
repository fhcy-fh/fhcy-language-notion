import { ApiResult, BaseInfoType } from '@/src/types/CommonTypes'
import RequestUtils from '@/src/utils/RequestUtils'

export function NotionBaseClient(): Promise<ApiResult<BaseInfoType>> {
  return RequestUtils.get('/api/notion/base')
}
