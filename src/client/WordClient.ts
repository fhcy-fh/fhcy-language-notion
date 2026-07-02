import { ApiResult } from '@/src/types/CommonTypes'
import RequestUtils from '@/src/utils/RequestUtils'
import { WordType } from '@/src/types/WordTypes'

export function NotionWordAllIdsClient(
  data_source_id: string,
): Promise<ApiResult<string[]>> {
  return RequestUtils.get('/api/notion/word/allIds', {
    data_source_id,
  })
}

export function NotionWordGetByIdsClient(
  ids: string[],
): Promise<ApiResult<WordType[]>> {
  return RequestUtils.post('/api/notion/word/getByIds', {
    ids,
  })
}
