import { ApiResult } from '@/src/types/CommonTypes'
import RequestUtils from '@/src/utils/RequestUtils'
import { BookType } from '@/src/types/BookTypes'

export function NotionBookClient(): Promise<ApiResult<BookType[]>> {
  return RequestUtils.get('/api/notion/book')
}
